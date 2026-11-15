// FullWidget official plugin "fullwidget.perf": GPU load, video memory, temperature and the frame
// rate of the program in front. Compiled by main.ps1 with Windows PowerShell's C# 5 compiler, so
// no newer C# here. Talks to FullWidget with one JSON object per line on stdin/stdout.
//
//   GPU load and memory: Windows' own "GPU Engine" and "GPU Adapter Memory" counters (PDH), the
//     same numbers Task Manager shows; adapter names and sizes from DXGI.
//   NVIDIA: temperature, power, clock and fan from nvidia-smi, when the driver has it.
//   Frame rate: the Present calls of Direct3D 9–12 programs, counted from Windows' event tracing
//     (ETW). Windows lets only administrators and members of "Performance Log Users" listen, so
//     without that the frame rate says why it's missing; "enableFps" adds the user to that group.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class FwPerf
{
    static readonly object OutGate = new object();
    static TextWriter Out;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    static void Send(object o)
    {
        string s = Json.Serialize(o);
        lock (OutGate) { Out.Write(s); Out.Write('\n'); Out.Flush(); }
    }

    public static void Log(string s)
    {
        lock (OutGate) { Console.Error.WriteLine(s); Console.Error.Flush(); }
    }

    public static void Run()
    {
        Out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        Gpu.Init();
        Smi.Start();
        Fps.Start();
        // a reading every second, as an event for the widgets listening
        var timer = new Timer(delegate
        {
            try { Fps.Tick(); Send(new Dictionary<string, object> { { "event", "stats" }, { "data", Stats() } }); }
            catch (Exception e) { Log("stats: " + e); }
        }, null, 1000, 1000);
        string line;
        while ((line = input.ReadLine()) != null)
        {
            if (line.Trim().Length == 0) continue;
            ThreadPool.QueueUserWorkItem(Answer, line);
        }
        // FullWidget closed our input: stop
        timer.Dispose();
        Fps.Stop();
    }

    static void Answer(object state)
    {
        object id = null;
        try
        {
            var req = Json.Deserialize<Dictionary<string, object>>((string)state);
            req.TryGetValue("id", out id);
            object m;
            req.TryGetValue("method", out m);
            object result;
            switch (m as string)
            {
                case "stats": result = Stats(); break;
                case "info": result = Info(); break;
                case "enableFps": result = Fps.Enable(); break;
                default: throw new Exception("no method \"" + m + "\" (stats, info, enableFps)");
            }
            Send(new Dictionary<string, object> { { "id", id }, { "result", result } });
        }
        catch (Exception e)
        {
            Send(new Dictionary<string, object> { { "id", id }, { "error", e.Message } });
        }
    }

    static Dictionary<string, object> Stats()
    {
        return new Dictionary<string, object>
        {
            { "time", (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds },
            { "gpus", Gpu.Read() },
            { "fps", Fps.Read() },
        };
    }

    static Dictionary<string, object> Info()
    {
        var gpus = new List<object>();
        foreach (var a in Gpu.Adapters) gpus.Add(new Dictionary<string, object> { { "name", a.Name }, { "vramTotal", a.Dedicated }, { "luid", a.Luid } });
        return new Dictionary<string, object> { { "gpus", gpus }, { "nvidiaSmi", Smi.Found }, { "fps", Fps.State }, { "fpsMessage", Fps.Message } };
    }

    // ───────────────────────── GPU: adapters (DXGI) and counters (PDH) ─────────────────────────

    public sealed class Adapter
    {
        public string Name, Luid;
        public long Dedicated;
    }

    public static class Gpu
    {
        public static readonly List<Adapter> Adapters = new List<Adapter>();
        static IntPtr query, engine, dedicated, shared;

        public static void Init()
        {
            try { ReadAdapters(); }
            catch (Exception e) { Log("DXGI: " + e.Message); }
            int r = PdhOpenQuery(null, IntPtr.Zero, out query);
            if (r != 0) { Log("PdhOpenQuery " + r.ToString("X")); return; }
            PdhAddEnglishCounter(query, @"\GPU Engine(*)\Utilization Percentage", IntPtr.Zero, out engine);
            PdhAddEnglishCounter(query, @"\GPU Adapter Memory(*)\Dedicated Usage", IntPtr.Zero, out dedicated);
            PdhAddEnglishCounter(query, @"\GPU Adapter Memory(*)\Shared Usage", IntPtr.Zero, out shared);
            PdhCollectQueryData(query); // load is a rate: it needs two readings
        }

        static void ReadAdapters()
        {
            Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
            IDXGIFactory1 f;
            if (CreateDXGIFactory1(ref iid, out f) != 0) return;
            try
            {
                for (uint i = 0; ; i++)
                {
                    IDXGIAdapter1 a;
                    if (f.EnumAdapters1(i, out a) != 0) break;
                    try
                    {
                        DXGI_ADAPTER_DESC1 d;
                        if (a.GetDesc1(out d) != 0) continue;
                        if ((d.Flags & 2) != 0) continue; // the software renderer
                        string luid = string.Format("0x{0:X8}_0x{1:X8}", d.LuidHigh, d.LuidLow);
                        bool seen = false;
                        foreach (var x in Adapters) if (x.Luid == luid) seen = true;
                        if (!seen) Adapters.Add(new Adapter { Name = d.Description.Trim(), Luid = luid, Dedicated = (long)d.DedicatedVideoMemory.ToUInt64() });
                    }
                    finally { Marshal.ReleaseComObject(a); }
                }
            }
            finally { Marshal.ReleaseComObject(f); }
        }

        /// One entry per adapter that has video memory or is busy: load (busiest engine), memory, and what nvidia-smi adds.
        public static List<object> Read()
        {
            var util = new Dictionary<string, Dictionary<string, double>>(StringComparer.OrdinalIgnoreCase); // luid → engine → %
            var ded = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            var shr = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            if (query != IntPtr.Zero && PdhCollectQueryData(query) == 0)
            {
                foreach (var kv in Values(engine, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100))
                {
                    // pid_1234_luid_0x00000000_0x0000C6E3_phys_0_eng_3_engtype_3D
                    string n = kv.Key;
                    int l = n.IndexOf("luid_"), e = n.IndexOf("_eng_");
                    if (l < 0 || e < 0) continue;
                    string luid = n.Substring(l + 5, 21);
                    int t = n.IndexOf("_engtype_", e);
                    string eng = t < 0 ? n.Substring(e) : n.Substring(e, t - e);
                    Dictionary<string, double> m;
                    if (!util.TryGetValue(luid, out m)) util[luid] = m = new Dictionary<string, double>();
                    double v;
                    m.TryGetValue(eng, out v);
                    m[eng] = v + kv.Value;
                }
                foreach (var kv in Values(dedicated, PDH_FMT_DOUBLE)) Add(ded, kv.Key, kv.Value);
                foreach (var kv in Values(shared, PDH_FMT_DOUBLE)) Add(shr, kv.Key, kv.Value);
            }
            var list = new List<object>();
            var smi = Smi.Read();
            var used = new HashSet<string>();
            foreach (var a in Adapters)
            {
                double load = -1;
                Dictionary<string, double> m;
                if (util.TryGetValue(a.Luid, out m)) foreach (var v in m.Values) load = Math.Max(load, v);
                double dUsed, sUsed;
                bool hasD = ded.TryGetValue(a.Luid, out dUsed);
                shr.TryGetValue(a.Luid, out sUsed);
                // no counters: a display-only adapter (virtual screens), or the same GPU seen a second time
                if (!hasD && load < 0) continue;
                var g = new Dictionary<string, object>
                {
                    { "name", a.Name },
                    { "util", load < 0 ? (object)null : Math.Round(Math.Min(100, load), 1) },
                    { "vramUsed", hasD ? (object)(long)dUsed : null },
                    { "vramTotal", a.Dedicated > 0 ? (object)a.Dedicated : null },
                    { "sharedUsed", (long)sUsed },
                    { "temp", null }, { "power", null }, { "powerLimit", null }, { "clock", null }, { "fan", null },
                };
                Dictionary<string, object> s;
                if (smi != null && smi.TryGetValue(a.Name, out s) && used.Add(a.Name))
                    foreach (var kv in s) g[kv.Key] = kv.Value;
                list.Add(g);
            }
            return list;
        }

        static void Add(Dictionary<string, double> d, string instance, double v)
        {
            // luid_0x00000000_0x0000C6E3_phys_0
            int l = instance.IndexOf("luid_");
            if (l < 0 || instance.Length < l + 26) return;
            string luid = instance.Substring(l + 5, 21);
            double old;
            d.TryGetValue(luid, out old);
            d[luid] = old + v;
        }

        static List<KeyValuePair<string, double>> Values(IntPtr counter, uint format)
        {
            var list = new List<KeyValuePair<string, double>>();
            if (counter == IntPtr.Zero) return list;
            uint size = 0, count;
            int r = PdhGetFormattedCounterArray(counter, format, ref size, out count, IntPtr.Zero);
            if (r != PDH_MORE_DATA || size == 0) return list;
            IntPtr buf = Marshal.AllocHGlobal((int)size);
            try
            {
                if (PdhGetFormattedCounterArray(counter, format, ref size, out count, buf) != 0) return list;
                int item = IntPtr.Size == 8 ? 24 : 16;
                for (int i = 0; i < count; i++)
                {
                    IntPtr p = buf + i * item;
                    string name = Marshal.PtrToStringUni(Marshal.ReadIntPtr(p));
                    int status = Marshal.ReadInt32(p, IntPtr.Size);
                    if (status != 0 && status != 1) continue; // PDH_CSTATUS_VALID_DATA, PDH_CSTATUS_NEW_DATA
                    double v = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(p, item - 8));
                    list.Add(new KeyValuePair<string, double>(name ?? "", v));
                }
            }
            finally { Marshal.FreeHGlobal(buf); }
            return list;
        }

        const uint PDH_FMT_DOUBLE = 0x200, PDH_FMT_NOCAP100 = 0x8000;
        const int PDH_MORE_DATA = unchecked((int)0x800007D2);
        [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern int PdhOpenQuery(string src, IntPtr user, out IntPtr q);
        [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern int PdhAddEnglishCounter(IntPtr q, string path, IntPtr user, out IntPtr c);
        [DllImport("pdh.dll")] static extern int PdhCollectQueryData(IntPtr q);
        [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern int PdhGetFormattedCounterArray(IntPtr c, uint fmt, ref uint size, out uint count, IntPtr buf);

        [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IDXGIFactory1 f);
    }

    // only the slots up to the methods used; the others are placeholders that keep the order
    [ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDXGIFactory1
    {
        void _SetPrivateData(); void _SetPrivateDataInterface(); void _GetPrivateData(); void _GetParent();
        void _EnumAdapters(); void _MakeWindowAssociation(); void _GetWindowAssociation(); void _CreateSwapChain(); void _CreateSoftwareAdapter();
        [PreserveSig] int EnumAdapters1(uint index, out IDXGIAdapter1 adapter);
    }

    [ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDXGIAdapter1
    {
        void _SetPrivateData(); void _SetPrivateDataInterface(); void _GetPrivateData(); void _GetParent();
        void _EnumOutputs(); void _GetDesc(); void _CheckInterfaceSupport();
        [PreserveSig] int GetDesc1(out DXGI_ADAPTER_DESC1 desc);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DXGI_ADAPTER_DESC1
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
        public uint VendorId, DeviceId, SubSysId, Revision;
        public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory;
        public uint LuidLow;
        public int LuidHigh;
        public uint Flags;
    }

    // ───────────────────────── NVIDIA: nvidia-smi every 2 s ─────────────────────────

    public static class Smi
    {
        public static bool Found;
        static string exe;
        static Dictionary<string, Dictionary<string, object>> last;
        static readonly object Gate = new object();

        public static void Start()
        {
            foreach (var p in new[] { Path.Combine(Environment.SystemDirectory, "nvidia-smi.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"NVIDIA Corporation\NVSMI\nvidia-smi.exe") })
                if (File.Exists(p)) { exe = p; break; }
            Found = exe != null;
            if (!Found) return;
            var t = new Thread(Loop) { IsBackground = true, Name = "nvidia-smi" };
            t.Start();
        }

        public static Dictionary<string, Dictionary<string, object>> Read() { lock (Gate) return last; }

        static void Loop()
        {
            while (true)
            {
                try
                {
                    var psi = new ProcessStartInfo(exe, "--query-gpu=name,temperature.gpu,power.draw,power.limit,clocks.gr,fan.speed --format=csv,noheader,nounits")
                    { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, StandardOutputEncoding = Encoding.UTF8 };
                    using (var p = Process.Start(psi))
                    {
                        string text = p.StandardOutput.ReadToEnd();
                        p.WaitForExit(5000);
                        var map = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
                        foreach (var raw in text.Split('\n'))
                        {
                            var f = raw.Split(',');
                            if (f.Length < 6) continue;
                            map[f[0].Trim()] = new Dictionary<string, object>
                            {
                                { "temp", Num(f[1]) }, { "power", Num(f[2]) }, { "powerLimit", Num(f[3]) }, { "clock", Num(f[4]) }, { "fan", Num(f[5]) },
                            };
                        }
                        lock (Gate) last = map;
                    }
                }
                catch (Exception e) { Log("nvidia-smi: " + e.Message); Thread.Sleep(30000); }
                Thread.Sleep(2000);
            }
        }

        static object Num(string s)
        {
            double v;
            return double.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? (object)v : null;
        }
    }

    // ───────────────────────── frame rate: Present calls (ETW) ─────────────────────────

    public static class Fps
    {
        /// "ok", "needs-permission" (not an administrator or Performance Log User), "signout" (just added: sign out and in), "error"
        public static string State = "starting";
        public static string Message;
        const string Session = "FullWidget-Perf";
        static readonly Guid DXGI = new Guid("CA11C036-0102-4A2D-A6AD-F03CFED5D3C9");
        static readonly Guid D3D9 = new Guid("783ACA0A-790E-4D7F-8451-AA850511C6B9");
        static readonly object Gate = new object();
        static Dictionary<int, int> counting = new Dictionary<int, int>(), counted = new Dictionary<int, int>();
        static DateTime countedSince = DateTime.UtcNow;
        static double countedSeconds = 1;
        static ulong session, trace;
        static EventRecordCallback callback; // kept alive while Windows calls it
        static readonly Dictionary<int, string> names = new Dictionary<int, string>();

        public static void Start()
        {
            Stop(); // a session left over from a plugin that was ended
            IntPtr props = Properties();
            try
            {
                int r = StartTrace(out session, Session, props);
                if (r == 5) { State = "needs-permission"; Message = "Windows only lets administrators and members of Performance Log Users read frame rates"; return; }
                if (r != 0) { State = "error"; Message = "StartTrace: " + new Win32Exception(r).Message; return; }
            }
            finally { Marshal.FreeHGlobal(props); }
            Guid g = DXGI;
            EnableTraceEx2(session, ref g, 1, 4, 0, 0, 0, IntPtr.Zero);
            g = D3D9;
            EnableTraceEx2(session, ref g, 1, 4, 0, 0, 0, IntPtr.Zero);

            callback = OnEvent;
            var log = new EVENT_TRACE_LOGFILE { LoggerName = Session, ProcessTraceMode = 0x100 | 0x10000000, EventRecordCallback = callback };
            trace = OpenTrace(ref log);
            if (trace == ulong.MaxValue || trace == 0xFFFFFFFF) { State = "error"; Message = "OpenTrace: " + new Win32Exception(Marshal.GetLastWin32Error()).Message; Stop(); return; }
            var t = new Thread(delegate () { ProcessTrace(new[] { trace }, 1, IntPtr.Zero, IntPtr.Zero); }) { IsBackground = true, Name = "etw" };
            t.Start();
            State = "ok";
        }

        public static void Stop()
        {
            if (trace != 0) { CloseTrace(trace); trace = 0; }
            IntPtr props = Properties();
            try { ControlTrace(0, Session, props, 1 /* EVENT_TRACE_CONTROL_STOP */); }
            finally { Marshal.FreeHGlobal(props); }
            session = 0;
        }

        static void OnEvent(IntPtr rec)
        {
            // EVENT_RECORD.EventHeader: ProcessId at 12, ProviderId at 24, EventDescriptor.Id at 40
            int id = (ushort)Marshal.ReadInt16(rec, 40);
            if (id != 42 && id != 1) return;
            var provider = (Guid)Marshal.PtrToStructure(rec + 24, typeof(Guid));
            if (!(id == 42 && provider == DXGI) && !(id == 1 && provider == D3D9)) return; // Present_Start
            int pid = Marshal.ReadInt32(rec, 12);
            lock (Gate) { int n; counting.TryGetValue(pid, out n); counting[pid] = n + 1; }
        }

        /// Called every second: what was counted becomes the last second's rate.
        public static void Tick()
        {
            lock (Gate)
            {
                var now = DateTime.UtcNow;
                countedSeconds = Math.Max(0.2, (now - countedSince).TotalSeconds);
                countedSince = now;
                counted = counting;
                counting = new Dictionary<int, int>();
            }
        }

        public static Dictionary<string, object> Read()
        {
            var r = new Dictionary<string, object> { { "state", State }, { "value", null }, { "process", null }, { "title", null } };
            if (State != "ok") { r["message"] = Message; return r; }
            Dictionary<int, int> c;
            double secs;
            lock (Gate) { c = counted; secs = countedSeconds; }
            IntPtr fg = GetForegroundWindow();
            uint pid;
            GetWindowThreadProcessId(fg, out pid);
            int n;
            if (pid != 0 && c.TryGetValue((int)pid, out n) && n > 0)
            {
                r["value"] = Math.Round(n / secs);
                r["process"] = Name((int)pid);
                var sb = new StringBuilder(256);
                GetWindowText(fg, sb, sb.Capacity);
                r["title"] = sb.ToString();
            }
            else r["state"] = "idle"; // the program in front isn't drawing with Direct3D
            // every program drawing frames this second, busiest first, so a widget can show the one
            // the user chose rather than the one in front: [{ process, name, value }], one per program
            var byName = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in c)
            {
                if (kv.Value <= 0) continue;
                string proc = Name(kv.Key);
                if (proc.StartsWith("pid ")) continue; // already gone
                double v = Math.Round(kv.Value / secs);
                Dictionary<string, object> have;
                if (byName.TryGetValue(proc, out have) && (double)have["value"] >= v) continue;
                byName[proc] = new Dictionary<string, object> { { "process", proc }, { "name", Description(kv.Key, proc) }, { "value", v } };
            }
            var programs = new List<Dictionary<string, object>>(byName.Values);
            programs.Sort(delegate (Dictionary<string, object> a, Dictionary<string, object> b) { return ((double)b["value"]).CompareTo((double)a["value"]); });
            r["programs"] = programs;
            return r;
        }

        static string Name(int pid)
        {
            string n;
            if (names.TryGetValue(pid, out n)) return n;
            try { n = Process.GetProcessById(pid).ProcessName; } catch (ArgumentException) { n = "pid " + pid; }
            if (names.Count > 200) names.Clear();
            return names[pid] = n;
        }

        static readonly Dictionary<int, string> descriptions = new Dictionary<int, string>();

        /// The program's own name, "ELDEN RING™" rather than "eldenring", when Windows lets us read it
        /// (an elevated or protected game may not); else the process name.
        static string Description(int pid, string proc)
        {
            string d;
            if (descriptions.TryGetValue(pid, out d)) return d;
            d = proc;
            try
            {
                using (var p = Process.GetProcessById(pid))
                {
                    string desc = (p.MainModule.FileVersionInfo.FileDescription ?? "").Trim();
                    if (desc.Length > 1 && desc.Length < 60) d = desc;
                }
            }
            catch (Exception) { /* no access: the process name will do */ }
            if (descriptions.Count > 200) descriptions.Clear();
            return descriptions[pid] = d;
        }

        /// Adds this user to Performance Log Users (S-1-5-32-559), with Windows asking for the
        /// administrator's OK. It counts after signing out and in again.
        public static Dictionary<string, object> Enable()
        {
            if (State == "ok") return new Dictionary<string, object> { { "ok", true } };
            string me = WindowsIdentity.GetCurrent().User.Value;
            var psi = new ProcessStartInfo("powershell.exe",
                "-NoProfile -NonInteractive -WindowStyle Hidden -Command \"Add-LocalGroupMember -SID S-1-5-32-559 -Member " + me + " -ErrorAction SilentlyContinue\"")
            { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden };
            try
            {
                using (var p = Process.Start(psi)) { p.WaitForExit(30000); }
            }
            catch (Win32Exception e)
            {
                if (e.NativeErrorCode == 1223) return new Dictionary<string, object> { { "ok", false }, { "cancelled", true } }; // the user said no
                throw;
            }
            State = "signout";
            Message = "Sign out of Windows and back in, then the frame rate shows";
            return new Dictionary<string, object> { { "ok", true }, { "signOut", true } };
        }

        /// For checking the structures above against a saved trace (.etl), which needs no special
        /// rights: how many events each process wrote, and the most common provider/event pairs.
        public static string Probe(string etl)
        {
            var pids = new Dictionary<int, int>();
            var kinds = new Dictionary<string, int>();
            EventRecordCallback cb = delegate (IntPtr rec)
            {
                int pid = Marshal.ReadInt32(rec, 12), id = (ushort)Marshal.ReadInt16(rec, 40);
                var provider = (Guid)Marshal.PtrToStructure(rec + 24, typeof(Guid));
                int n;
                pids.TryGetValue(pid, out n); pids[pid] = n + 1;
                string k = provider + "/" + id;
                kinds.TryGetValue(k, out n); kinds[k] = n + 1;
            };
            var log = new EVENT_TRACE_LOGFILE { LogFileName = etl, ProcessTraceMode = 0x10000000, EventRecordCallback = cb };
            ulong h = OpenTrace(ref log);
            if (h == ulong.MaxValue || h == 0xFFFFFFFF) return "OpenTrace failed: " + Marshal.GetLastWin32Error();
            int r = ProcessTrace(new[] { h }, 1, IntPtr.Zero, IntPtr.Zero);
            CloseTrace(h);
            GC.KeepAlive(cb);
            var sb = new StringBuilder("ProcessTrace " + r + "; processes:");
            foreach (var kv in pids) sb.Append(" " + kv.Key + "×" + kv.Value);
            sb.Append("; events:");
            foreach (var kv in kinds) sb.Append("\n  " + kv.Key + " ×" + kv.Value);
            return sb.ToString();
        }

        static IntPtr Properties()
        {
            // EVENT_TRACE_PROPERTIES (120 bytes on 64-bit Windows) followed by room for the session name
            int size = 120 + 1024;
            IntPtr p = Marshal.AllocHGlobal(size);
            for (int i = 0; i < size; i++) Marshal.WriteByte(p, i, 0);
            Marshal.WriteInt32(p, 0, size);           // Wnode.BufferSize
            Marshal.WriteInt32(p, 40, 1);             // Wnode.ClientContext: QPC time
            Marshal.WriteInt32(p, 44, 0x00020000);    // Wnode.Flags: WNODE_FLAG_TRACED_GUID
            Marshal.WriteInt32(p, 48, 64);            // BufferSize (KB)
            Marshal.WriteInt32(p, 64, 0x00000100);    // LogFileMode: EVENT_TRACE_REAL_TIME_MODE
            Marshal.WriteInt32(p, 68, 1);             // FlushTimer: 1 s
            Marshal.WriteInt32(p, 116, 120);          // LoggerNameOffset
            return p;
        }

        public delegate void EventRecordCallback(IntPtr record);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct EVENT_TRACE_LOGFILE
        {
            public string LogFileName;
            public string LoggerName;
            public long CurrentTime;
            public uint BuffersRead;
            public uint ProcessTraceMode;
            public EVENT_TRACE CurrentEvent;
            public TRACE_LOGFILE_HEADER LogfileHeader;
            public IntPtr BufferCallback;
            public uint BufferSize;
            public uint Filled;
            public uint EventsLost;
            public EventRecordCallback EventRecordCallback;
            public uint IsKernelTrace;
            public IntPtr Context;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct EVENT_TRACE
        {
            public ushort Size, FieldTypeFlags;
            public uint Version, ThreadId, ProcessId;
            public long TimeStamp;
            public Guid Guid;
            public uint KernelTime, UserTime, InstanceId, ParentInstanceId;
            public Guid ParentGuid;
            public IntPtr MofData;
            public uint MofLength, ClientContext;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct TRACE_LOGFILE_HEADER
        {
            public uint BufferSize, Version, ProviderVersion, NumberOfProcessors;
            public long EndTime;
            public uint TimerResolution, MaximumFileSize, LogFileMode, BuffersWritten;
            public Guid LogInstanceGuid;
            public IntPtr LoggerName, LogFileName;
            public TIME_ZONE_INFORMATION TimeZone;
            public long BootTime, PerfFreq, StartTime;
            public uint ReservedFlags, BuffersLost;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct TIME_ZONE_INFORMATION
        {
            public int Bias;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string StandardName;
            public SYSTEMTIME StandardDate;
            public int StandardBias;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DaylightName;
            public SYSTEMTIME DaylightDate;
            public int DaylightBias;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct SYSTEMTIME { public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds; }

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern int StartTrace(out ulong handle, string name, IntPtr props);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern int ControlTrace(ulong handle, string name, IntPtr props, uint code);
        [DllImport("advapi32.dll")] static extern int EnableTraceEx2(ulong handle, ref Guid provider, uint control, byte level, ulong any, ulong all, uint timeout, IntPtr parameters);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern ulong OpenTrace(ref EVENT_TRACE_LOGFILE log);
        [DllImport("advapi32.dll")] static extern int ProcessTrace(ulong[] handles, uint count, IntPtr start, IntPtr end);
        [DllImport("advapi32.dll")] static extern int CloseTrace(ulong handle);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    }
}
