// FullWidget official plugin "fullwidget.files": the files in a folder, for widgets such as Folder
// box. Compiled by main.ps1 with Windows PowerShell's C# 5 compiler, so no newer C# here. Talks to
// FullWidget with one JSON object per line on stdin/stdout.
//
// A widget reaches only folders the user picked in this plugin's own folder dialog ("pick"), each
// widget its own: the plugin remembers them in <FullWidget data>\plugin-data\fullwidget.files.
// Within such a folder it lists files and folders with their Windows icons, opens them, shows them
// in Explorer, drags them out to other programs, copies or moves dropped files in, renames, makes
// folders and sends to the Recycle Bin, and tells the widget when something in it changes.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Timer = System.Threading.Timer;

public static class FwFiles
{
    static readonly object OutGate = new object();
    static TextWriter Out;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    static string Lang = "en";

    static void Send(object o)
    {
        string s = Json.Serialize(o);
        lock (OutGate) { Out.Write(s); Out.Write('\n'); Out.Flush(); }
    }

    public static void Log(string s)
    {
        lock (OutGate) { Console.Error.WriteLine(s); Console.Error.Flush(); }
    }

    /// An error for the widget, in the interface language.
    sealed class Problem : Exception
    {
        public Problem(string zhTW, string zhCN, string en) : base(Lang == "zh-TW" ? zhTW : Lang == "zh-CN" ? zhCN : en) { }
    }

    public static void Run()
    {
        Lang = Environment.GetEnvironmentVariable("FULLWIDGET_LANG") ?? "en";
        Out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        Roots.Load();
        Ui.Start();
        string line;
        while ((line = input.ReadLine()) != null)
        {
            if (line.Trim().Length == 0) continue;
            ThreadPool.QueueUserWorkItem(Answer, line);
        }
        Watch.StopAll();
        Ui.Stop();
    }

    static void Answer(object state)
    {
        object id = null;
        try
        {
            var req = Json.Deserialize<Dictionary<string, object>>((string)state);
            id = req.ContainsKey("id") ? req["id"] : null;
            string method = req.ContainsKey("method") ? req["method"] as string : null;
            var p = req.ContainsKey("params") ? req["params"] as Dictionary<string, object> : null;
            if (p == null) p = new Dictionary<string, object>();
            string widget = req.ContainsKey("widget") ? req["widget"] as string ?? "" : "";
            Send(new Dictionary<string, object> { { "id", id }, { "result", Call(method, p, widget) } });
        }
        catch (Exception e)
        {
            if (!(e is Problem)) Log("error: " + e);
            Send(new Dictionary<string, object> { { "id", id }, { "error", e.Message } });
        }
    }

    static object Call(string method, Dictionary<string, object> p, string widget)
    {
        switch (method)
        {
            case "pick": return Pick(widget, Str(p, "title"));
            case "folders": return Roots.Of(widget);
            case "forget": Roots.Forget(widget, Str(p, "root")); Watch.Stop(Str(p, "root")); return null;
            case "list": return List(Root(p, widget), Str(p, "folder") ?? "");
            case "icons": return Icons(Root(p, widget), Strs(p, "paths"), (int)Num(p, "size", 48));
            case "open": Open(Item(p, widget, "path")); return null;
            case "reveal": Reveal(Item(p, widget, "path")); return null;
            case "drag": return Drag(Items(p, widget, "paths"));
            case "add": return Add(Root(p, widget), Str(p, "folder") ?? "", Strs(p, "files"), Str(p, "mode") ?? "auto");
            case "rename": return Rename(Root(p, widget), Item(p, widget, "path"), Str(p, "name") ?? "");
            case "mkdir": return MakeFolder(Root(p, widget), Str(p, "folder") ?? "", Str(p, "name") ?? "");
            case "trash": Trash(Items(p, widget, "paths")); return null;
            case "copyPath": Ui.Invoke(delegate { Clipboard.SetText(string.Join("\r\n", Items(p, widget, "paths").ToArray())); return null; }); return null;
            case "watch": { string r = Root(p, widget); Watch.Start(r); return null; }
            case "unwatch": Watch.Stop(Str(p, "root")); return null;
            case "info": return new Dictionary<string, object> { { "version", "1.0.0" } };
        }
        throw new Problem("沒有方法 " + method, "没有方法 " + method, "no method " + method);
    }

    // ───────────────────────── params ─────────────────────────

    static string Str(Dictionary<string, object> p, string k) { object v; return p.TryGetValue(k, out v) ? v as string : null; }
    static double Num(Dictionary<string, object> p, string k, double def)
    {
        object v;
        if (!p.TryGetValue(k, out v) || v == null) return def;
        try { return Convert.ToDouble(v); } catch { return def; }
    }
    static List<string> Strs(Dictionary<string, object> p, string k)
    {
        var list = new List<string>();
        object v;
        if (p.TryGetValue(k, out v) && v is System.Collections.IEnumerable && !(v is string))
            foreach (var x in (System.Collections.IEnumerable)v) if (x is string) list.Add((string)x);
        return list;
    }

    /// The folder the widget asks about: one the user picked for it.
    static string Root(Dictionary<string, object> p, string widget)
    {
        string root = Str(p, "root");
        if (string.IsNullOrEmpty(root)) throw new Problem("還沒有選資料夾", "还没有选文件夹", "no folder chosen yet");
        root = Norm(root);
        if (!Roots.Allowed(widget, root)) throw new Problem("這個資料夾還沒有給這個組件用", "这个文件夹还没有交给这个组件", "this folder wasn't picked for this widget");
        if (!Directory.Exists(root)) throw new Problem("資料夾不見了：" + root, "文件夹不见了：" + root, "the folder is gone: " + root);
        return root;
    }

    /// A path inside the root: "sub/file.txt" → full path; never outside the root.
    static string Inside(string root, string rel)
    {
        if (rel == null) rel = "";
        string full = Norm(Path.Combine(root, rel.Replace('/', '\\')));
        if (!full.Equals(root, StringComparison.OrdinalIgnoreCase) && !full.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase))
            throw new Problem("不在這個資料夾裏", "不在这个文件夹里", "not inside the folder");
        return full;
    }

    static string Item(Dictionary<string, object> p, string widget, string key)
    {
        string full = Inside(Root(p, widget), Str(p, key));
        if (!File.Exists(full) && !Directory.Exists(full)) throw new Problem("找不到它了", "找不到它了", "it's gone");
        return full;
    }

    static List<string> Items(Dictionary<string, object> p, string widget, string key)
    {
        string root = Root(p, widget);
        var list = new List<string>();
        foreach (var rel in Strs(p, key))
        {
            string full = Inside(root, rel);
            if (full.Equals(root, StringComparison.OrdinalIgnoreCase)) continue;
            if (File.Exists(full) || Directory.Exists(full)) list.Add(full);
        }
        if (list.Count == 0) throw new Problem("找不到它了", "找不到它了", "it's gone");
        return list;
    }

    static string Norm(string path)
    {
        path = Environment.ExpandEnvironmentVariables(path.Trim().Trim('"'));
        return Path.GetFullPath(path).TrimEnd('\\');
    }

    static string Rel(string root, string full)
    {
        return full.Length <= root.Length ? "" : full.Substring(root.Length + 1).Replace('\\', '/');
    }

    static long Ms(DateTime utc) { return (long)(utc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds; }

    // ───────────────────────── the folders a widget may use ─────────────────────────

    static class Roots
    {
        static readonly object Gate = new object();
        static Dictionary<string, List<string>> map = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        static string file;

        public static void Load()
        {
            // the plugin runs in <data>\plugins\fullwidget.files; what it remembers lives beside the
            // plugins, so updating the plugin (which replaces its folder) keeps it
            string data = Path.GetDirectoryName(Path.GetDirectoryName(Path.GetFullPath(Environment.CurrentDirectory)));
            string dir = Path.Combine(data, "plugin-data", "fullwidget.files");
            file = Path.Combine(dir, "folders.json");
            try
            {
                if (File.Exists(file))
                {
                    var loaded = Json.Deserialize<Dictionary<string, List<string>>>(File.ReadAllText(file, Encoding.UTF8));
                    if (loaded != null) map = new Dictionary<string, List<string>>(loaded, StringComparer.OrdinalIgnoreCase);
                }
            }
            catch (Exception e) { Log("folders.json: " + e.Message); }
        }

        static void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                File.WriteAllText(file, Json.Serialize(map), new UTF8Encoding(false));
            }
            catch (Exception e) { Log("folders.json: " + e.Message); }
        }

        public static void Add(string widget, string root)
        {
            lock (Gate)
            {
                List<string> list;
                if (!map.TryGetValue(widget, out list)) map[widget] = list = new List<string>();
                if (!list.Exists(x => x.Equals(root, StringComparison.OrdinalIgnoreCase))) { list.Add(root); Save(); }
            }
        }

        public static void Forget(string widget, string root)
        {
            if (string.IsNullOrEmpty(root)) return;
            root = Norm(root);
            lock (Gate)
            {
                List<string> list;
                if (map.TryGetValue(widget, out list) && list.RemoveAll(x => x.Equals(root, StringComparison.OrdinalIgnoreCase)) > 0) Save();
            }
        }

        public static bool Allowed(string widget, string root)
        {
            lock (Gate)
            {
                List<string> list;
                return map.TryGetValue(widget, out list) && list.Exists(x => x.Equals(root, StringComparison.OrdinalIgnoreCase));
            }
        }

        public static List<string> Of(string widget)
        {
            lock (Gate)
            {
                List<string> list;
                return map.TryGetValue(widget, out list) ? new List<string>(list) : new List<string>();
            }
        }
    }

    // ───────────────────────── pick, list, icons ─────────────────────────

    static object Pick(string widget, string title)
    {
        string chosen = (string)Ui.Invoke(delegate { return Ui.PickFolder(title); });
        if (chosen == null) return null;
        string root = Norm(chosen);
        Roots.Add(widget, root);
        return new Dictionary<string, object> { { "root", root }, { "name", Display(root) } };
    }

    static string Display(string root)
    {
        string name = Path.GetFileName(root);
        return name.Length > 0 ? name : root;
    }

    const int MaxItems = 2000;

    static object List(string root, string folder)
    {
        string dir = Inside(root, folder);
        if (!Directory.Exists(dir)) throw new Problem("資料夾不見了", "文件夹不见了", "the folder is gone");
        var items = new List<object>();
        bool more = false;
        var info = new DirectoryInfo(dir);
        foreach (var fs in info.EnumerateFileSystemInfos())
        {
            FileAttributes a;
            try { a = fs.Attributes; } catch (IOException) { continue; } catch (UnauthorizedAccessException) { continue; }
            if ((a & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
            if (items.Count >= MaxItems) { more = true; break; }
            bool isDir = (a & FileAttributes.Directory) != 0;
            long size = 0;
            if (!isDir) try { size = ((FileInfo)fs).Length; } catch (IOException) { }
            string ext = isDir ? "" : fs.Extension.ToLowerInvariant();
            items.Add(new Dictionary<string, object>
            {
                { "path", Rel(root, fs.FullName) },
                { "name", isDir || ext == ".lnk" || ext == ".url" ? (ext.Length > 0 ? Path.GetFileNameWithoutExtension(fs.Name) : fs.Name) : fs.Name },
                { "file", fs.Name },
                { "ext", ext },
                { "dir", isDir },
                { "size", size },
                { "modified", Ms(fs.LastWriteTimeUtc) },
            });
        }
        return new Dictionary<string, object>
        {
            { "root", root }, { "name", Display(root) }, { "folder", Rel(root, dir) }, { "items", items }, { "more", more },
        };
    }

    // one icon per file type for ordinary files; programs, shortcuts, pictures and folders each their own
    static readonly Dictionary<string, string> IconCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    static readonly HashSet<string> OwnIcon = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".lnk", ".url", ".ico", ".cur", ".appref-ms", ".msi", ".scr",
        ".jpg", ".jpeg", ".jfif", ".png", ".gif", ".webp", ".bmp", ".avif", ".heic", ".heif", ".tif", ".tiff", ".svg",
        ".mp4", ".mkv", ".mov", ".avi", ".wmv", ".webm", ".m4v", ".pdf", ".psd",
    };

    static object Icons(string root, List<string> rels, int size)
    {
        size = Math.Max(16, Math.Min(256, size));
        var result = new Dictionary<string, object>();
        foreach (var rel in rels)
        {
            string full;
            try { full = Inside(root, rel); } catch (Problem) { continue; }
            bool dir = Directory.Exists(full);
            if (!dir && !File.Exists(full)) continue;
            string ext = dir ? "" : Path.GetExtension(full);
            bool own = dir || ext.Length == 0 || OwnIcon.Contains(ext);
            string key = (own ? full + "|" + (dir ? Directory.GetLastWriteTimeUtc(full) : File.GetLastWriteTimeUtc(full)).Ticks : "*" + ext) + "|" + size;
            string uri;
            lock (IconCache) IconCache.TryGetValue(key, out uri);
            if (uri == null)
            {
                uri = Shell.Image(full, size, !dir);
                if (uri == null) continue;
                lock (IconCache) { if (IconCache.Count > 3000) IconCache.Clear(); IconCache[key] = uri; }
            }
            result[rel] = uri;
        }
        return result;
    }

    // ───────────────────────── open, show, drag ─────────────────────────

    static void Open(string full)
    {
        var psi = new ProcessStartInfo(full) { UseShellExecute = true };
        if (File.Exists(full)) psi.WorkingDirectory = Path.GetDirectoryName(full);
        try { Process.Start(psi); }
        catch (System.ComponentModel.Win32Exception e)
        {
            if (e.NativeErrorCode == 1223) return; // the user said no to UAC
            if (e.NativeErrorCode == 1155) { Process.Start("rundll32.exe", "shell32.dll,OpenAs_RunDLL " + full); return; } // nothing opens this type: "Open with"
            throw new Problem("打不開：" + e.Message, "打不开：" + e.Message, "can't open it: " + e.Message);
        }
    }

    static void Reveal(string full)
    {
        Process.Start("explorer.exe", "/select,\"" + full + "\"");
    }

    /// Drags the files out of the widget, as Explorer does: into another folder, a chat, an editor.
    /// Called while the mouse button is still down on the widget.
    static object Drag(List<string> files)
    {
        return Ui.Invoke(delegate
        {
            if (Control.MouseButtons == MouseButtons.None) return "none";
            var data = new DataObject(DataFormats.FileDrop, files.ToArray());
            var effect = Ui.Host.DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Move | DragDropEffects.Link);
            return effect == DragDropEffects.None ? "none" : effect.ToString().ToLowerInvariant();
        });
    }

    // ───────────────────────── changing files ─────────────────────────

    /// Files dropped on the widget: moved in from the same drive, copied from another (as Explorer
    /// does), or as `mode` says. Windows shows its own progress and makes "name (2)" for clashes.
    static object Add(string root, string folder, List<string> files, string mode)
    {
        string to = Inside(root, folder);
        if (!Directory.Exists(to)) throw new Problem("資料夾不見了", "文件夹不见了", "the folder is gone");
        var from = new List<string>();
        foreach (var f in files)
        {
            string full;
            try { full = Path.GetFullPath(f).TrimEnd('\\'); } catch { continue; }
            if (!File.Exists(full) && !Directory.Exists(full)) continue;
            if (string.Equals(Path.GetDirectoryName(full), to, StringComparison.OrdinalIgnoreCase)) continue; // already here
            if (to.Equals(full, StringComparison.OrdinalIgnoreCase) || to.StartsWith(full + "\\", StringComparison.OrdinalIgnoreCase)) continue; // a folder into itself
            from.Add(full);
        }
        if (from.Count == 0) return new Dictionary<string, object> { { "done", 0 }, { "mode", "none" } };
        bool move = mode == "move" || (mode == "auto" && string.Equals(Path.GetPathRoot(from[0]), Path.GetPathRoot(to), StringComparison.OrdinalIgnoreCase));
        bool ok = Shell.Operate(move ? Shell.FO_MOVE : Shell.FO_COPY, from, to, Shell.FOF_ALLOWUNDO | Shell.FOF_RENAMEONCOLLISION | Shell.FOF_NOCONFIRMMKDIR);
        return new Dictionary<string, object> { { "done", ok ? from.Count : 0 }, { "mode", move ? "move" : "copy" } };
    }

    static readonly char[] BadName = Path.GetInvalidFileNameChars();

    static string CheckName(string name)
    {
        name = (name ?? "").Trim().TrimEnd('.');
        if (name.Length == 0 || name.IndexOfAny(BadName) >= 0 || name == "." || name == "..")
            throw new Problem("名稱不能有 \\ / : * ? \" < > |", "名称不能有 \\ / : * ? \" < > |", "a name can't have \\ / : * ? \" < > |");
        return name;
    }

    static object Rename(string root, string full, string name)
    {
        if (full.Equals(root, StringComparison.OrdinalIgnoreCase)) throw new Problem("不能改這個資料夾本身的名字", "不能改这个文件夹本身的名字", "can't rename the folder itself");
        name = CheckName(name);
        string to = Path.Combine(Path.GetDirectoryName(full), name);
        if (to.Equals(full, StringComparison.Ordinal)) return Rel(root, full);
        bool caseOnly = to.Equals(full, StringComparison.OrdinalIgnoreCase);
        if (!caseOnly && (File.Exists(to) || Directory.Exists(to))) throw new Problem("已經有同名的了", "已经有同名的了", "something with that name is already there");
        try
        {
            if (Directory.Exists(full))
            {
                if (caseOnly) { string tmp = full + ".~fw"; Directory.Move(full, tmp); Directory.Move(tmp, to); }
                else Directory.Move(full, to);
            }
            else File.Move(full, to);
        }
        catch (IOException e) { throw new Problem("改不了名字：" + e.Message, "改不了名字：" + e.Message, "can't rename it: " + e.Message); }
        catch (UnauthorizedAccessException e) { throw new Problem("改不了名字：" + e.Message, "改不了名字：" + e.Message, "can't rename it: " + e.Message); }
        return Rel(root, to);
    }

    static object MakeFolder(string root, string folder, string name)
    {
        string parent = Inside(root, folder);
        name = CheckName(name);
        string to = Path.Combine(parent, name);
        for (int n = 2; Directory.Exists(to) || File.Exists(to); n++) to = Path.Combine(parent, name + " (" + n + ")");
        Directory.CreateDirectory(to);
        return Rel(root, to);
    }

    static void Trash(List<string> files)
    {
        Shell.Operate(Shell.FO_DELETE, files, null, Shell.FOF_ALLOWUNDO | Shell.FOF_NOCONFIRMATION | Shell.FOF_SILENT);
    }

    // ───────────────────────── telling widgets about changes ─────────────────────────

    static class Watch
    {
        static readonly Dictionary<string, FileSystemWatcher> watchers = new Dictionary<string, FileSystemWatcher>(StringComparer.OrdinalIgnoreCase);
        static readonly Dictionary<string, Timer> soon = new Dictionary<string, Timer>(StringComparer.OrdinalIgnoreCase);

        public static void Start(string root)
        {
            lock (watchers)
            {
                if (watchers.ContainsKey(root)) return;
                var w = new FileSystemWatcher(root) { IncludeSubdirectories = true, NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size };
                FileSystemEventHandler changed = delegate { Changed(root); };
                w.Created += changed; w.Deleted += changed; w.Changed += changed;
                w.Renamed += delegate { Changed(root); };
                w.Error += delegate { Changed(root); };
                w.EnableRaisingEvents = true;
                watchers[root] = w;
            }
        }

        // many changes at once (a big copy) become one event
        static void Changed(string root)
        {
            lock (watchers)
            {
                Timer t;
                if (soon.TryGetValue(root, out t)) { t.Change(400, Timeout.Infinite); return; }
                soon[root] = new Timer(delegate
                {
                    lock (watchers) { Timer x; if (soon.TryGetValue(root, out x)) { x.Dispose(); soon.Remove(root); } }
                    Send(new Dictionary<string, object> { { "event", "changed" }, { "data", new Dictionary<string, object> { { "root", root } } } });
                }, null, 400, Timeout.Infinite);
            }
        }

        public static void Stop(string root)
        {
            if (string.IsNullOrEmpty(root)) return;
            root = Norm(root);
            lock (watchers)
            {
                FileSystemWatcher w;
                if (watchers.TryGetValue(root, out w)) { w.Dispose(); watchers.Remove(root); }
            }
        }

        public static void StopAll()
        {
            lock (watchers) { foreach (var w in watchers.Values) w.Dispose(); watchers.Clear(); }
        }
    }

    // ───────────────────────── the window thread: dialogs, dragging, Windows' file operations ─────────────────────────

    static class Ui
    {
        public static Form Host;
        static Thread thread;
        static readonly ManualResetEvent ready = new ManualResetEvent(false);

        public static void Start()
        {
            thread = new Thread(delegate ()
            {
                Application.OleRequired();
                Host = new Form
                {
                    FormBorderStyle = FormBorderStyle.None, ShowInTaskbar = false, StartPosition = FormStartPosition.Manual,
                    Size = new Size(1, 1), Location = new Point(-32000, -32000), Opacity = 0, Text = "FullWidget files",
                };
                var h = Host.Handle; // a window to own dialogs and start drags from
                ready.Set();
                Application.Run();
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.IsBackground = true;
            thread.Start();
            ready.WaitOne();
        }

        public static void Stop()
        {
            try { Host.BeginInvoke(new MethodInvoker(Application.ExitThread)); } catch { }
        }

        public delegate object Work();

        public static object Invoke(Work work)
        {
            object result = null;
            Exception error = null;
            Host.Invoke(new MethodInvoker(delegate
            {
                try { result = work(); } catch (Exception e) { error = e; }
            }));
            if (error != null) throw error is Problem ? error : new Exception(error.Message, error);
            return result;
        }

        /// Windows' folder dialog, in front: the plugin runs in the background, so it borrows the
        /// foreground from whatever window has it (FullWidget, whose widget was just clicked).
        public static string PickFolder(string title)
        {
            Host.Location = Cursor.Position;
            Host.TopMost = true;
            Host.Show();
            try
            {
                IntPtr fg = GetForegroundWindow();
                uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero), me = GetCurrentThreadId();
                if (fgThread != 0 && fgThread != me) AttachThreadInput(me, fgThread, true);
                SetForegroundWindow(Host.Handle);
                if (fgThread != 0 && fgThread != me) AttachThreadInput(me, fgThread, false);
                var dlg = (IFileOpenDialog)new FileOpenDialogRCW();
                try
                {
                    uint opts;
                    dlg.GetOptions(out opts);
                    dlg.SetOptions(opts | 0x20 /* FOS_PICKFOLDERS */ | 0x40 /* FOS_FORCEFILESYSTEM */ | 0x800 /* FOS_PATHMUSTEXIST */);
                    if (!string.IsNullOrEmpty(title)) dlg.SetTitle(title);
                    if (dlg.Show(Host.Handle) != 0) return null;
                    IShellItem item;
                    dlg.GetResult(out item);
                    IntPtr name;
                    item.GetDisplayName(0x80058000 /* SIGDN_FILESYSPATH */, out name);
                    try { return Marshal.PtrToStringUni(name); } finally { Marshal.FreeCoTaskMem(name); }
                }
                finally { Marshal.ReleaseComObject(dlg); }
            }
            finally
            {
                Host.Hide();
                Host.Location = new Point(-32000, -32000);
            }
        }

        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
        [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

        [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogRCW { }

        [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IFileOpenDialog
        {
            [PreserveSig] int Show(IntPtr parent);
            void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
            void SetFileTypeIndex(uint iFileType);
            void GetFileTypeIndex(out uint piFileType);
            void Advise(IntPtr pfde, out uint pdwCookie);
            void Unadvise(uint dwCookie);
            void SetOptions(uint fos);
            void GetOptions(out uint pfos);
            void SetDefaultFolder(IShellItem psi);
            void SetFolder(IShellItem psi);
            void GetFolder(out IShellItem ppsi);
            void GetCurrentSelection(out IShellItem ppsi);
            void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
            void GetFileName(out IntPtr pszName);
            void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
            void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
            void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
            void GetResult(out IShellItem ppsi);
            void AddPlace(IShellItem psi, int fdap);
            void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
            void Close(int hr);
            void SetClientGuid(ref Guid guid);
            void ClearClientData();
            void SetFilter(IntPtr pFilter);
            void GetResults(out IntPtr ppenum);
            void GetSelectedItems(out IntPtr ppsai);
        }

        [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItem
        {
            void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
            void GetParent(out IShellItem ppsi);
            void GetDisplayName(uint sigdnName, out IntPtr ppszName);
            void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
            void Compare(IShellItem psi, uint hint, out int piOrder);
        }
    }

    // ───────────────────────── Windows shell ─────────────────────────

    static class Shell
    {
        public const uint FO_MOVE = 1, FO_COPY = 2, FO_DELETE = 3;
        public const ushort FOF_SILENT = 0x4, FOF_RENAMEONCOLLISION = 0x8, FOF_NOCONFIRMATION = 0x10, FOF_ALLOWUNDO = 0x40, FOF_NOCONFIRMMKDIR = 0x200;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEOPSTRUCT
        {
            public IntPtr hwnd;
            public uint wFunc;
            public string pFrom;
            public string pTo;
            public ushort fFlags;
            [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
            public IntPtr hNameMappings;
            public string lpszProgressTitle;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHFileOperation(ref SHFILEOPSTRUCT op);

        /// Windows' own copy, move or delete (to the Recycle Bin with FOF_ALLOWUNDO), with its
        /// progress window for long ones. True unless it failed or was cancelled.
        public static bool Operate(uint func, List<string> from, string to, ushort flags)
        {
            return (bool)Ui.Invoke(delegate
            {
                var op = new SHFILEOPSTRUCT
                {
                    hwnd = Ui.Host.Handle, wFunc = func, fFlags = flags,
                    pFrom = string.Join("\0", from.ToArray()) + "\0\0",
                    pTo = to == null ? null : to + "\0\0",
                };
                int r = SHFileOperation(ref op);
                if (r != 0 && !op.fAnyOperationsAborted) throw new Problem("沒有完成（錯誤 " + r + "）", "没有完成（错误 " + r + "）", "it didn't finish (error " + r + ")");
                return r == 0 && !op.fAnyOperationsAborted;
            });
        }

        [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }

        [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr bitmap); }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
        static extern int SHCreateItemFromParsingName(string path, IntPtr bindCtx, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);

        [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public ushort bmPlanes, bmBitsPixel; public IntPtr bmBits; }
        [StructLayout(LayoutKind.Sequential)]
        struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public ushort biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }

        [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, out BITMAP bm);
        [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr hdc, IntPtr hbm, uint start, uint lines, byte[] bits, ref BITMAPINFOHEADER bmi, uint usage);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
        [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

        /// What Explorer shows for the path at `size` pixels: a picture's thumbnail when
        /// `thumbnail` and there is one, otherwise its icon. A PNG data: URI.
        public static string Image(string full, int size, bool thumbnail)
        {
            IntPtr hbm = IntPtr.Zero;
            try
            {
                var iid = typeof(IShellItemImageFactory).GUID;
                IShellItemImageFactory factory;
                if (SHCreateItemFromParsingName(full, IntPtr.Zero, ref iid, out factory) != 0) return null;
                const int SIIGBF_BIGGERSIZEOK = 0x1, SIIGBF_ICONONLY = 0x4;
                int flags = thumbnail ? SIIGBF_BIGGERSIZEOK : SIIGBF_BIGGERSIZEOK | SIIGBF_ICONONLY;
                if (factory.GetImage(new SIZE { cx = size, cy = size }, flags, out hbm) != 0) return null;
                return ToPng(hbm, size);
            }
            catch (COMException) { return null; }
            catch (InvalidCastException) { return null; }
            catch (ArgumentException) { return null; }
            finally { if (hbm != IntPtr.Zero) DeleteObject(hbm); }
        }

        static string ToPng(IntPtr hbm, int max)
        {
            BITMAP bm;
            if (GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), out bm) == 0 || bm.bmWidth <= 0 || bm.bmHeight == 0) return null;
            int w = bm.bmWidth, h = Math.Abs(bm.bmHeight);
            var bmi = new BITMAPINFOHEADER { biSize = Marshal.SizeOf(typeof(BITMAPINFOHEADER)), biWidth = w, biHeight = -h, biPlanes = 1, biBitCount = 32 };
            var bits = new byte[w * h * 4];
            var dc = GetDC(IntPtr.Zero);
            try { if (GetDIBits(dc, hbm, 0, (uint)h, bits, ref bmi, 0) == 0) return null; }
            finally { ReleaseDC(IntPtr.Zero, dc); }
            bool anyAlpha = false;
            for (int i = 3; i < bits.Length; i += 4) if (bits[i] != 0) { anyAlpha = true; break; }
            if (!anyAlpha) for (int i = 3; i < bits.Length; i += 4) bits[i] = 255;
            using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppPArgb))
            {
                var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
                for (int y = 0; y < h; y++) Marshal.Copy(bits, y * w * 4, data.Scan0 + y * data.Stride, w * 4);
                bmp.UnlockBits(data);
                Bitmap outBmp = bmp;
                // a big thumbnail comes back at its own size: keep it within `max` (×2 for sharp screens)
                int limit = max * 2;
                Bitmap scaled = null;
                if (w > limit || h > limit)
                {
                    double s = Math.Min((double)limit / w, (double)limit / h);
                    scaled = new Bitmap(Math.Max(1, (int)(w * s)), Math.Max(1, (int)(h * s)), PixelFormat.Format32bppPArgb);
                    using (var g = Graphics.FromImage(scaled))
                    {
                        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        g.DrawImage(bmp, 0, 0, scaled.Width, scaled.Height);
                    }
                    outBmp = scaled;
                }
                try
                {
                    using (var ms = new MemoryStream())
                    {
                        outBmp.Save(ms, ImageFormat.Png);
                        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                    }
                }
                finally { if (scaled != null) scaled.Dispose(); }
            }
        }
    }
}
