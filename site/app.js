// FullWidget 組件市場: reads index.json (built by scripts/build.mjs) and shows it.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The GitHub repository behind this site: <owner>.github.io/<repo>/ → github.com/<owner>/<repo>
const REPO = (() => {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  return m && repo ? `https://github.com/${m[1]}/${repo}` : "https://github.com/hmgvibe/fullwidget-market";
})();

// ── words ──
const WORDS = {
  "組件市場": ["组件市场", "Widget market"],
  "投稿組件": ["投稿组件", "Submit a widget"],
  // [繁, 简, English] where the key is only a name
  "SUB": ["在 FullWidget 控制中心的<b>「添加組件 → 線上」</b>一鍵安裝；也可以下載 .fwz 檔案，雙擊安裝。", "在 FullWidget 控制中心的<b>「添加组件 → 在线」</b>一键安装；也可以下载 .fwz 文件，双击安装。", "Install in one click from the FullWidget Control Center (<b>Add widgets → Online</b>), or download the .fwz file and double-click it."],
  "搜尋組件": ["搜索组件", "Search widgets"],
  "全部": ["全部", "All"],
  "時間": ["时间", "Time"], "天氣": ["天气", "Weather"], "系統": ["系统", "System"], "效率": ["效率", "Productivity"],
  "資訊": ["资讯", "Info"], "媒體與裝飾": ["媒体与装饰", "Media & decor"], "其他": ["其他", "Other"],
  "量被畫出來": ["量被画出来", "Instrument"], "玻璃上的字": ["玻璃上的字", "Type"], "書桌上的紙": ["书桌上的纸", "Paper"],
  "組件由投稿者提供，經過自動檢查和維護者審核。安裝前請看清楚它要的權限。": ["组件由投稿者提供，经过自动检查和维护者审核。安装前请看清楚它要的权限。", "Widgets come from their authors and are checked automatically and by a maintainer. Look at what each one may do before installing it."],
  "如何投稿": ["如何投稿", "How to submit"],
  "回報問題": ["反馈问题", "Report a problem"],
  "正在載入…": ["正在加载…", "Loading…"],
  "暫時打不開組件清單": ["暂时打不开组件列表", "Can't load the widget list right now"],
  "重試": ["重试", "Retry"],
  "沒有符合的組件": ["没有符合的组件", "No widgets match"],
  "還沒有組件，歡迎第一個投稿": ["还没有组件，欢迎第一个投稿", "No widgets yet. Be the first to submit one"],
  "不需要權限": ["不需要权限", "No permissions"],
  "下載 .fwz": ["下载 .fwz", "Download .fwz"],
  "原始碼": ["源代码", "Source"],
  "它可以做什麼": ["它可以做什么", "What it may do"],
  "只顯示自己的內容，不能連網，也讀不到你電腦上的資訊。": ["只显示自己的内容，不能联网，也读不到你电脑上的信息。", "It shows only its own content: no network, and nothing from your PC."],
  "版本": ["版本", "Version"], "大小": ["大小", "Size"], "更新": ["更新", "Updated"], "檔案": ["文件", "Files"], "作者": ["作者", "Author"],
  "INSTALL_HINT": ["在 FullWidget 控制中心 →「添加組件」→「線上」可以直接安裝。", "在 FullWidget 控制中心 →「添加组件」→「在线」可以直接安装。", "Or install it straight from the FullWidget Control Center: Add widgets → Online."],
  "需要 FullWidget 1.1.0 以上": ["需要 FullWidget 1.1.0 以上", "Needs FullWidget 1.1.0 or later"],
  "關閉": ["关闭", "Close"],
  "官方插件": ["官方插件", "Official plugins"],
  "官方": ["官方", "Official"],
  "OFFICIAL_SUB": ["FullWidget 自己做的插件，讓組件拿到網頁拿不到的資料。只收官方的，原始碼都公開，在 FullWidget 1.4.0 以上的控制中心安裝。", "FullWidget 自己做的插件，让组件拿到网页拿不到的数据。只收官方的，源代码都公开，在 FullWidget 1.4.0 以上的控制中心安装。", "FullWidget's own plugins, which give widgets data a web page can't reach. Official ones only, source in the open; install them from the Control Center of FullWidget 1.4.0 or later."],
  "在你的電腦上運行": ["在你的电脑上运行", "Runs on your PC"],
  "PLUGIN_HINT": ["在 FullWidget 控制中心 →「添加組件」→「線上」→「官方插件」安裝（需要 1.4.0 以上）。插件會用你的身份在電腦上運行，組件用到它時才啟動。", "在 FullWidget 控制中心 →“添加组件”→“在线”→“官方插件”安装（需要 1.4.0 以上）。插件会用你的身份在电脑上运行，组件用到它时才启动。", "Install it in the FullWidget Control Center: Add widgets → Online → Official plugins (1.4.0 or later). It runs as you on your PC, starting only when a widget uses it."],
  "用到它的組件": ["用到它的组件", "Widgets that use it"],
  "使用官方插件「{n}」": ["使用官方插件“{n}”", "Use the official plugin \"{n}\""],
  "讀取這個官方插件提供的資料。插件要另外安裝。": ["读取这个官方插件提供的数据。插件要另外安装。", "Reads what this official plugin provides. The plugin is installed separately."],
  "需要 FullWidget 1.4.0 以上": ["需要 FullWidget 1.4.0 以上", "Needs FullWidget 1.4.0 or later"],
  // permissions
  "讀取系統資訊": ["读取系统信息", "Read system info"], "處理器、記憶體、網速、磁碟和電池的使用情況。": ["处理器、内存、网速、磁盘和电池的使用情况。", "CPU, memory, network speed, drives and battery."],
  "顯示通知": ["显示通知", "Show notifications"], "在螢幕角落彈出 Windows 通知。": ["在屏幕角落弹出 Windows 通知。", "Pops up Windows notifications."],
  "調整音量": ["调整音量", "Change the volume"], "讀取和改變系統音量，也可以靜音。": ["读取和改变系统音量，也可以静音。", "Reads and changes the system volume, and can mute it."],
  "讀取和控制正在播放的媒體": ["读取和控制正在播放的媒体", "See and control what's playing"], "看到正在播放的歌名和封面，可以播放、暫停和切換曲目。": ["看到正在播放的歌名和封面，可以播放、暂停和切换曲目。", "Sees what's playing and can play, pause and skip."],
  "打開網址": ["打开网址", "Open links"], "用你的瀏覽器打開網頁或郵件連結。": ["用你的浏览器打开网页或邮件链接。", "Opens web pages or email links in your browser."],
  "打開程式和檔案": ["打开程序和文件", "Open programs and files"], "打開你電腦上的程式、資料夾和檔案。只在你信任這個組件時安裝。": ["打开你电脑上的程序、文件夹和文件。只在你信任这个组件时安装。", "Opens programs, folders and files on your PC. Install it only if you trust it."],
  "連到任何網站": ["连到任何网站", "Reach any website"], "可以和任何網站收發資料。": ["可以和任何网站收发数据。", "May send and receive data with any website."],
  "連到 {h}": ["连到 {h}", "Reach {h}"], "和這個網站收發資料。": ["和这个网站收发数据。", "Sends and receives data with this website."],
  "系統資訊": ["系统信息", "system info"], "通知": ["通知", "notifications"], "音量": ["音量", "volume"], "媒體播放": ["媒体播放", "media"],
  "打開程式": ["打开程序", "open programs"], "任何網站": ["任何网站", "any website"],
};
const LANGS = ["zh-TW", "zh-CN", "en"];
let lang = (() => {
  try { const s = localStorage.getItem("lang"); if (LANGS.includes(s)) return s; } catch { }
  const n = (navigator.language || "en").toLowerCase();
  return n.startsWith("zh") ? (/cn|sg|hans/.test(n) ? "zh-CN" : "zh-TW") : "en";
})();
/** Text in the page's language. Keys are the Traditional Chinese text; WORDS has 简 and English. */
const t = (k, vars) => {
  const w = WORDS[k];
  let s = w && w.length === 3 ? w[LANGS.indexOf(lang)] : lang === "zh-TW" || !w ? k : w[lang === "zh-CN" ? 0 : 1];
  for (const [a, b] of Object.entries(vars || {})) s = s.replace(`{${a}}`, b);
  return s;
};
/** A widget's text in the current language: "x" or { "zh-TW": …, "en": … } */
const pick = (v) => (v && typeof v === "object" ? v[lang] ?? (lang === "zh-CN" ? v["zh-TW"] : null) ?? v.en ?? Object.values(v)[0] ?? "" : v ?? "");

const CATS = [["time", "時間"], ["weather", "天氣"], ["system", "系統"], ["productivity", "效率"], ["info", "資訊"], ["media", "媒體與裝飾"], ["other", "其他"]];
const THEMES = [["instrument", "量被畫出來"], ["type", "玻璃上的字"], ["paper", "書桌上的紙"]];

function permInfo(p) {
  if (p === "system") return { name: t("系統資訊"), title: t("讀取系統資訊"), desc: t("處理器、記憶體、網速、磁碟和電池的使用情況。") };
  if (p === "notify") return { name: t("通知"), title: t("顯示通知"), desc: t("在螢幕角落彈出 Windows 通知。") };
  if (p === "audio") return { name: t("音量"), title: t("調整音量"), desc: t("讀取和改變系統音量，也可以靜音。") };
  if (p === "media") return { name: t("媒體播放"), title: t("讀取和控制正在播放的媒體"), desc: t("看到正在播放的歌名和封面，可以播放、暫停和切換曲目。") };
  if (p === "shell.open") return { name: t("打開網址"), title: t("打開網址"), desc: t("用你的瀏覽器打開網頁或郵件連結。") };
  if (p === "shell.launch") return { name: t("打開程式"), title: t("打開程式和檔案"), desc: t("打開你電腦上的程式、資料夾和檔案。只在你信任這個組件時安裝。"), warn: true };
  if (p.startsWith("plugin:")) {
    const pl = data && (data.plugins || []).find((x) => x.id === p.slice(7));
    const n = pl ? pick(pl.name) : p.slice(7);
    return { name: `${t("官方插件")} ${n}`, title: t("使用官方插件「{n}」", { n }), desc: t("讀取這個官方插件提供的資料。插件要另外安裝。"), plugin: p.slice(7) };
  }
  const h = p.slice(8);
  if (h === "*") return { name: t("任何網站"), title: t("連到任何網站"), desc: t("可以和任何網站收發資料。"), warn: true };
  return { name: h, title: t("連到 {h}", { h }), desc: t("和這個網站收發資料。") };
}

// ── state ──
let data = null, cat = null, query = "";
let theme = (() => { try { return localStorage.getItem("theme") || "instrument"; } catch { return "instrument"; } })();
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

/** The preview picture for a widget in the chosen theme and language, falling back like FullWidget does. */
function previewOf(w, th = theme) {
  if (!w.preview) return null;
  const want = (thm, l) => w.preview.replace("{theme}", thm).replace("{lang}", l);
  const have = new Set(w.previews || []);
  if (!w.preview.includes("{")) return w.preview;
  for (const c of [want(th, lang), want(th, "en"), want(th, "zh-TW"), ...THEMES.map(([x]) => want(x, lang))]) if (have.has(c)) return c;
  return w.previews && w.previews[0] || null;
}

const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);
const day = (iso) => new Intl.DateTimeFormat(lang, { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));

function permChips(w) {
  if (!w.permissions.length) return `<span class="perm none">${esc(t("不需要權限"))}</span>`;
  return w.permissions.map((p) => { const i = permInfo(p); return `<span class="perm${i.warn ? " warn" : ""}">${esc(i.name)}</span>`; }).join("");
}

function card(w) {
  const img = previewOf(w);
  return `<article class="card" tabindex="0" data-id="${esc(w.id)}">
    <div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : w.icon ? `<img class="icon" src="${esc(w.icon)}" alt="">` : ""}</div>
    <div><h3>${esc(pick(w.name))}</h3><div class="by">${esc(w.author || "—")} · <span class="num">v${esc(w.version)}</span></div></div>
    <p>${esc(pick(w.description))}</p>
    <div class="perms">${permChips(w)}</div>
  </article>`;
}

const PLUG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v4"/></svg>';

function pluginCard(p) {
  return `<article class="card plugin" tabindex="0" data-plugin="${esc(p.id)}">
    <div class="p-top"><span class="p-icon">${PLUG}</span><div><h3>${esc(pick(p.name))}</h3><div class="by"><span class="badge">${esc(t("官方"))}</span> <span class="num">v${esc(p.version)}</span></div></div></div>
    <p>${esc(pick(p.description))}</p>
    <div class="perms"><span class="perm">${esc(t("在你的電腦上運行"))} <code>${esc(p.run)}</code></span></div>
  </article>`;
}

function render() {
  document.documentElement.lang = lang === "en" ? "en" : lang === "zh-CN" ? "zh-Hans" : "zh-Hant";
  document.title = `FullWidget ${t("組件市場")}`;
  $("t-market").textContent = t("組件市場");
  $("t-title").textContent = t("組件市場");
  $("t-sub").innerHTML = t("SUB");
  $("t-foot").textContent = t("組件由投稿者提供，經過自動檢查和維護者審核。安裝前請看清楚它要的權限。");
  $("l-submit").textContent = t("投稿組件");
  $("f-guide").textContent = t("如何投稿");
  $("f-issues").textContent = t("回報問題");
  $("q").placeholder = t("搜尋組件");
  document.querySelectorAll(".langs button").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
  $("themes").innerHTML = THEMES.map(([id, n]) => `<button data-theme="${id}" class="${theme === id ? "on" : ""}">${esc(t(n))}</button>`).join("");

  $("t-official").textContent = t("官方插件");
  $("t-official-sub").textContent = t("OFFICIAL_SUB");
  if (!data) return;
  const plugins = (data.plugins || []).filter((p) => !query.trim() || `${p.id} ${JSON.stringify(p.name)} ${JSON.stringify(p.description)}`.toLowerCase().includes(query.trim().toLowerCase()));
  $("official").hidden = !plugins.length || !!cat;
  $("plugins").innerHTML = plugins.map(pluginCard).join("");
  const all = data.widgets;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = (w) => [w.id, w.author, ...Object.values(typeof w.name === "object" ? w.name : { x: w.name }), ...Object.values(typeof w.description === "object" ? w.description : { x: w.description })].join(" ").toLowerCase();
  const shown = all.filter((w) => (!cat || w.category === cat) && words.every((x) => text(w).includes(x)));
  const cats = CATS.filter(([c]) => all.some((w) => w.category === c));
  $("chips").innerHTML = [[null, "全部", all.length], ...cats.map(([c, n]) => [c, n, all.filter((w) => w.category === c).length])]
    .map(([c, n, k]) => `<button class="chip${cat === c ? " on" : ""}" data-cat="${c || ""}">${esc(t(n))}<span class="num">${k}</span></button>`).join("");
  $("gallery").innerHTML = shown.map(card).join("");
  $("state").innerHTML = !all.length ? `${esc(t("還沒有組件，歡迎第一個投稿"))}<br><a class="btn primary" href="${REPO}/blob/main/CONTRIBUTING.md">${esc(t("投稿組件"))}</a>`
    : shown.length ? "" : esc(t("沒有符合的組件"));
}

function openDetail(id) {
  const w = data && data.widgets.find((x) => x.id === id);
  if (!w) return;
  const shots = THEMES.map(([th, n]) => { const img = previewOf(w, th); return img ? `<figure><div class="thumb"><img src="${esc(img)}" alt=""></div><figcaption>${esc(t(n))}</figcaption></figure>` : ""; }).join("");
  const perms = w.permissions.length ? `<ul class="d-perms">${w.permissions.map((p) => { const i = permInfo(p); return `<li class="${i.warn ? "warn" : ""}"><div><b>${esc(i.title)}</b><span>${esc(i.desc)}</span></div></li>`; }).join("")}</ul>`
    : `<p class="d-hint">${esc(t("只顯示自己的內容，不能連網，也讀不到你電腦上的資訊。"))}</p>`;
  $("detail").innerHTML = `
    <div class="d-head">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : ""}<div><h2>${esc(pick(w.name))}</h2><div class="by">${esc(w.author || "—")} · <span class="num">v${esc(w.version)}</span></div></div>
      <button class="d-close" data-close aria-label="${esc(t("關閉"))}">×</button></div>
    <div class="d-body">
      <p>${esc(pick(w.description))}</p>
      ${shots ? `<div class="shots">${shots}</div>` : ""}
      <div><h3 class="d-label">${esc(t("它可以做什麼"))}</h3>${perms}</div>
      <dl class="facts">
        <div><dt>${esc(t("版本"))}</dt><dd class="num">${esc(w.version)}</dd></div>
        <div><dt>${esc(t("更新"))}</dt><dd>${esc(day(w.updated))}</dd></div>
        <div><dt>${esc(t("大小"))}</dt><dd class="num">${esc(kb(w.bytes))} · ${w.files} ${esc(t("檔案"))}</dd></div>
        <div><dt>SHA-256</dt><dd class="num" title="${esc(w.sha256)}">${esc(w.sha256.slice(0, 16))}…</dd></div>
      </dl>
      <div class="d-actions">
        <a class="btn primary" href="${esc(w.package)}" download><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>${esc(t("下載 .fwz"))}</a>
        <a class="btn" href="${REPO}/tree/main/widgets/${encodeURIComponent(w.id)}" target="_blank" rel="noopener">${esc(t("原始碼"))}</a>
        <span class="d-hint">${esc(t("INSTALL_HINT"))} ${esc(t(w.permissions.some((p) => p.startsWith("plugin:")) ? "需要 FullWidget 1.4.0 以上" : "需要 FullWidget 1.1.0 以上"))}</span>
      </div>
    </div>`;
  if (!$("detail").open) $("detail").showModal();
  history.replaceState(null, "", `#${encodeURIComponent(w.id)}`);
}

function openPlugin(id) {
  const p = data && (data.plugins || []).find((x) => x.id === id);
  if (!p) return;
  const users = data.widgets.filter((w) => w.permissions.includes(`plugin:${p.id}`));
  $("detail").innerHTML = `
    <div class="d-head"><span class="p-icon big">${PLUG}</span><div><h2>${esc(pick(p.name))}</h2><div class="by"><span class="badge">${esc(t("官方"))}</span> <span class="num">${esc(p.id)} · v${esc(p.version)}</span></div></div>
      <button class="d-close" data-close aria-label="${esc(t("關閉"))}">×</button></div>
    <div class="d-body">
      <p>${esc(pick(p.description))}</p>
      <div><h3 class="d-label">${esc(t("在你的電腦上運行"))}</h3><pre class="cmd">${esc(p.run)}</pre></div>
      ${users.length ? `<div><h3 class="d-label">${esc(t("用到它的組件"))}</h3><div class="perms">${users.map((w) => `<button class="perm link" data-open="${esc(w.id)}">${esc(pick(w.name))}</button>`).join("")}</div></div>` : ""}
      <dl class="facts">
        <div><dt>${esc(t("版本"))}</dt><dd class="num">${esc(p.version)}</dd></div>
        <div><dt>${esc(t("更新"))}</dt><dd>${esc(day(p.updated))}</dd></div>
        <div><dt>${esc(t("大小"))}</dt><dd class="num">${esc(kb(p.bytes))} · ${p.files} ${esc(t("檔案"))}</dd></div>
        <div><dt>SHA-256</dt><dd class="num" title="${esc(p.sha256)}">${esc(p.sha256.slice(0, 16))}…</dd></div>
      </dl>
      <div class="d-actions">
        <a class="btn primary" href="${REPO}/tree/main/${esc(p.source)}" target="_blank" rel="noopener">${esc(t("原始碼"))}</a>
        <span class="d-hint">${esc(t("PLUGIN_HINT"))}</span>
      </div>
    </div>`;
  if (!$("detail").open) $("detail").showModal();
  history.replaceState(null, "", `#plugin-${encodeURIComponent(p.id)}`);
}

async function load() {
  $("state").textContent = t("正在載入…");
  try {
    const r = await fetch("index.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
    data.widgets.sort((a, b) => b.updated.localeCompare(a.updated));
    render();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id.startsWith("plugin-")) openPlugin(id.slice(7));
    else if (id) openDetail(id);
  } catch {
    $("state").innerHTML = `${esc(t("暫時打不開組件清單"))}<br><button class="btn" id="retry">${esc(t("重試"))}</button>`;
    $("retry").onclick = load;
  }
}

// ── events ──
$("l-repo").href = REPO;
$("l-submit").href = $("f-guide").href = `${REPO}/blob/main/CONTRIBUTING.md`;
$("f-issues").href = `${REPO}/issues`;
$("q").addEventListener("input", (e) => { query = e.target.value; render(); });
document.addEventListener("click", (e) => {
  const l = e.target.closest("[data-lang]");
  if (l) {
    lang = l.dataset.lang; remember("lang", lang); render();
    if ($("detail").open) { const h = decodeURIComponent(location.hash.slice(1)); if (h.startsWith("plugin-")) openPlugin(h.slice(7)); else openDetail(h); }
    return;
  }
  const th = e.target.closest("[data-theme]");
  if (th) { theme = th.dataset.theme; remember("theme", theme); render(); return; }
  const c = e.target.closest("[data-cat]");
  if (c) { cat = c.dataset.cat || null; render(); return; }
  const o = e.target.closest("[data-open]");
  if (o) { openDetail(o.dataset.open); return; }
  const pl = e.target.closest("[data-plugin]");
  if (pl) { openPlugin(pl.dataset.plugin); return; }
  const k = e.target.closest(".card");
  if (k) { openDetail(k.dataset.id); return; }
  if (e.target.closest("[data-close]") || e.target === $("detail")) $("detail").close();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.classList || !e.target.classList.contains("card")) return;
  if (e.target.dataset.plugin) openPlugin(e.target.dataset.plugin); else openDetail(e.target.dataset.id);
});
$("detail").addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
render();
load();
