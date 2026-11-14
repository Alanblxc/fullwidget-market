// 性能監控: the frame rate of the game in front and the GPU from the official plugin
// "fullwidget.perf", CPU and memory from FullWidget itself.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const perf = widget.plugin("fullwidget.perf");
let opts = widget.settings.get();

const W = {
  vram: t({ "zh-TW": "顯存", "zh-CN": "显存", en: "VRAM" }),
  mem: t({ "zh-TW": "記憶體", "zh-CN": "内存", en: "Memory" }),
  noGame: t({ "zh-TW": "前景沒有遊戲", "zh-CN": "前台没有游戏", en: "No game in front" }),
  needs: t({ "zh-TW": "顯示幀率要 Windows 授權一次", "zh-CN": "显示帧率要 Windows 授权一次", en: "Frame rates need Windows' OK once" }),
  enable: t({ "zh-TW": "授權", "zh-CN": "授权", en: "Allow" }),
  signout: t({ "zh-TW": "登出再登入 Windows 後顯示幀率", "zh-CN": "注销再登录 Windows 后显示帧率", en: "Sign out of Windows and back in to see frame rates" }),
  missing: t({ "zh-TW": "需要官方插件「性能數據」", "zh-CN": "需要官方插件“性能数据”", en: "Needs the official Performance data plugin" }),
  where: t({ "zh-TW": "控制中心 → 添加組件 → 線上 → 官方插件", "zh-CN": "控制中心 → 添加组件 → 在线 → 官方插件", en: "Control Center → Add widgets → Online → Official plugins" }),
  allow: t({ "zh-TW": "插件還沒有允許", "zh-CN": "插件还没有允许", en: "The plugin isn't allowed yet" }),
  allowWhere: t({ "zh-TW": "控制中心 → 設定 → 插件", "zh-CN": "控制中心 → 设置 → 插件", en: "Control Center → Settings → Plugins" }),
  broken: t({ "zh-TW": "插件一直停下來", "zh-CN": "插件一直停下来", en: "The plugin keeps stopping" }),
};

const ROWS = [
  { key: "gpu", name: "GPU", gpu: true },
  { key: "vram", name: W.vram, gpu: true },
  { key: "cpu", name: "CPU" },
  { key: "mem", name: W.mem },
];
$("rows").innerHTML = ROWS.map((r) => `
  <div class="row" data-k="${r.key}"><span class="k w-label">${r.name}</span><span class="v w-num">–</span><div class="w-bar"><i></i></div></div>`).join("")
  + `<div class="sensors w-num" id="sensors"></div>`;

const gb = (b) => (b / 2 ** 30).toFixed(1);
const history = []; // the last minute of frame rates

function setRow(key, pct, text) {
  const row = document.querySelector(`.row[data-k="${key}"]`);
  const hot = pct != null && pct >= 90;
  row.querySelector(".v").innerHTML = text ?? (pct == null ? "–" : `${Math.round(pct)}<small>%</small>`);
  row.querySelector(".w-bar i").style.width = `${pct ?? 0}%`;
  row.querySelector(".w-bar").classList.toggle("is-warn", hot);
  row.classList.toggle("hot", hot);
}

/** The GPU worth showing: the one with its own memory (the graphics card), else the busiest. */
function mainGpu(gpus) {
  return [...(gpus || [])].sort((a, b) => (b.vramTotal || 0) - (a.vramTotal || 0) || (b.util || 0) - (a.util || 0))[0];
}

function spark() {
  const max = Math.max(60, ...history.filter((v) => v != null));
  const pts = history.map((v, i) => [(i / 59) * 120, v == null ? null : 29 - (v / max) * 26]);
  let line = "", pen = false;
  for (const [x, y] of pts) {
    if (y == null) { pen = false; continue; }
    line += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  $("line").setAttribute("d", line);
  const solid = pts.filter((p) => p[1] != null);
  $("area").setAttribute("d", solid.length > 1 ? `M${solid[0][0]} 30` + solid.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join("") + `L${solid[solid.length - 1][0]} 30Z` : "");
}

function hint(text, button) {
  $("hint").hidden = !text;
  $("spark").style.display = text ? "none" : "";
  $("hint-text").textContent = text || "";
  $("hint-btn").hidden = !button;
  if (button) $("hint-btn").textContent = button;
}

/** One reading from the plugin. */
function show(s) {
  missing(null);
  const f = s.fps || {};
  const ok = f.state === "ok" && f.value != null;
  $("fps").textContent = ok ? Math.round(f.value) : "–";
  $("fps").classList.toggle("none", !ok);
  $("perf").classList.toggle("low", ok && f.value < 30);
  $("app").textContent = ok ? f.process || "" : f.state === "idle" ? W.noGame : "";
  $("app").title = ok ? f.title || "" : "";
  history.push(ok ? f.value : null);
  while (history.length > 60) history.shift();
  if (f.state === "needs-permission") hint(W.needs, W.enable);
  else if (f.state === "signout") hint(W.signout);
  else if (f.state === "error") hint(f.message || "");
  else { hint(null); spark(); }

  const g = mainGpu(s.gpus);
  setRow("gpu", g ? g.util : null);
  if (g && g.vramUsed != null && g.vramTotal) setRow("vram", (g.vramUsed / g.vramTotal) * 100, `${gb(g.vramUsed)}<small> / ${gb(g.vramTotal)} GB</small>`);
  else setRow("vram", null);
  document.querySelector('.row[data-k="gpu"] .k').title = g ? g.name : "";
  const bits = [];
  if (g && g.temp != null) bits.push(`${Math.round(g.temp)}°C`);
  if (g && g.power != null) bits.push(`${Math.round(g.power)} W`);
  if (g && g.clock != null) bits.push(`${Math.round(g.clock)} MHz`);
  $("sensors").textContent = bits.join(" · ");
  $("sensors").hidden = !bits.length || opts.sensors === false;
}

function showSystem(d) {
  if (d.cpu) setRow("cpu", d.cpu.usage);
  if (d.memory) setRow("mem", d.memory.usage);
}

/** Why there is nothing to show: the plugin isn't installed, allowed or working. */
function missing(kind, detail) {
  $("missing").hidden = !kind;
  $("perf").hidden = !!kind;
  if (!kind) return;
  const [title, text] = kind === "install" ? [W.missing, W.where] : kind === "allow" ? [W.allow, W.allowWhere] : kind === "broken" ? [W.broken, W.allowWhere] : [detail || "", ""];
  $("missing-title").textContent = title;
  $("missing-text").textContent = text;
}

// the plugin sends a reading every second while a widget listens; listening also starts it,
// and starts it later if it's installed or allowed while the widget is on screen
let lastStats = 0;
perf.on("stats", (s) => { lastStats = Date.now(); show(s); });

// no readings: ask once, to learn why
async function check() {
  if (Date.now() - lastStats < 4000) return;
  try { show(await perf.call("stats", null, { timeout: 15000 })); }
  catch (e) {
    const m = String(e.message || e);
    missing(/no plugin/.test(m) ? "install" : /allowed/.test(m) ? "allow" : /kept stopping/.test(m) ? "broken" : "other", m);
  }
}
setTimeout(check, 1500);
setInterval(check, 5000);

$("hint-btn").addEventListener("click", async () => {
  $("hint-btn").disabled = true;
  try {
    const r = await perf.call("enableFps", null, { timeout: 120000 });
    if (r && r.signOut) hint(W.signout);
  } catch (e) { widget.log("enableFps: " + e.message); }
  $("hint-btn").disabled = false;
});

let unsubscribe = null;
function applySettings() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  const sys = opts.system !== false;
  $("perf").classList.toggle("no-system", !sys);
  if (sys) unsubscribe = widget.system.subscribe(["cpu", "memory"], showSystem, { interval: 1000 });
}
widget.settings.onChange((s) => { opts = s; applySettings(); });
applySettings();
