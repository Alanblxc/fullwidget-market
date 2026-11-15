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
  choose: t({ "zh-TW": "選擇要看幀率的軟體", "zh-CN": "选择要看帧率的软件", en: "Choose a program" }),
  front: t({ "zh-TW": "前景的軟體", "zh-CN": "前台的软件", en: "Whatever's in front" }),
  notDrawing: t({ "zh-TW": "{name}：沒有在畫面上", "zh-CN": "{name}：没在画面上", en: "{name}: not drawing" }),
  drawing: t({ "zh-TW": "正在繪製畫面的軟體", "zh-CN": "正在绘制画面的软件", en: "Programs drawing frames" }),
  none: t({ "zh-TW": "現在沒有軟體在繪製畫面，先打開遊戲", "zh-CN": "现在没有软件在绘制画面，先打开游戏", en: "Nothing is drawing frames. Start the game first" }),
  oldPlugin: t({ "zh-TW": "選軟體要新版的官方插件「性能數據」", "zh-CN": "选软件要新版的官方插件“性能数据”", en: "Choosing a program needs the newer Performance data plugin" }),
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
  const f = pickFps(s.fps || {});
  const ok = f.state === "ok" && f.value != null;
  $("app-name").textContent = f.label;
  $("app").classList.toggle("unset", !!f.unset);
  $("fps").textContent = ok ? Math.round(f.value) : "–";
  $("fps").classList.toggle("none", !ok);
  $("perf").classList.toggle("low", ok && f.value < 30);
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

// ───────────────────────── which program's frame rate ─────────────────────────

let programs = [];        // what drew frames in the last second: [{ process, name, value }]
const known = new Map();  // process → its own name, remembered for when it isn't drawing
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const chosen = () => String(opts.app || "").trim();

/** The reading for the program the user chose (or the one in front, for "*"), with a label. */
function pickFps(f) {
  if (Array.isArray(f.programs)) { programs = f.programs; for (const p of programs) known.set(p.process.toLowerCase(), p.name); }
  const app = chosen();
  if (f.state !== "ok") return { ...f, label: "" };
  if (!app) return { state: "ok", value: null, label: W.choose, unset: true };
  if (app === "*") return { ...f, label: f.state === "ok" && f.value != null ? f.process || "" : W.noGame };
  if (!Array.isArray(f.programs)) return { state: "ok", value: null, label: W.oldPlugin };
  const p = programs.find((x) => x.process.toLowerCase() === app.toLowerCase());
  const name = (p && p.name) || known.get(app.toLowerCase()) || app;
  return p ? { state: "ok", value: p.value, label: name } : { state: "ok", value: null, label: fmt(W.notDrawing, { name }) };
}

const menu = $("menu");
$("app").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!menu.hidden) return closeMenu();
  const app = chosen().toLowerCase();
  // what's drawing now, busiest first; the chosen one stays listed while it isn't
  const list = programs.filter((p) => !/^(dwm|msedgewebview2|fullwidget)$/i.test(p.process));
  if (app && app !== "*" && !list.some((p) => p.process.toLowerCase() === app)) list.unshift({ process: chosen(), name: known.get(app) || chosen(), value: null });
  menu.innerHTML = `<div class="mh">${W.drawing}</div>`
    + (list.length ? list.map((p) => `<button type="button" data-p="${esc(p.process)}" class="${p.process.toLowerCase() === app ? "on" : ""}"><span>${esc(p.name)}</span><small>${p.value == null ? "–" : Math.round(p.value)}</small></button>`).join("") : `<div class="mn">${W.none}</div>`)
    + `<hr><button type="button" data-p="*" class="${app === "*" ? "on" : ""}"><span>${W.front}</span></button>`;
  menu.hidden = false;
  const r = menu.getBoundingClientRect(), card = document.body.getBoundingClientRect(), a = $("app").getBoundingClientRect();
  menu.style.left = `${Math.max(card.left + 4, Math.min(a.left, card.right - r.width - 4))}px`;
  menu.style.top = `${Math.max(card.top + 4, Math.min(a.bottom + 4, card.bottom - r.height - 4))}px`;
});
menu.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  closeMenu();
  history.length = 0;
  widget.settings.set("app", b.dataset.p);
});
function closeMenu() { menu.hidden = true; }
document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target) && !$("app").contains(e.target)) closeMenu(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
window.addEventListener("blur", closeMenu);

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
