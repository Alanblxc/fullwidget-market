// 文件夹盒子: a folder on the desktop. Everything about the files goes through the official
// plugin "fullwidget.files" (listing with icons, opening, dragging out, taking files in, renaming,
// the Recycle Bin, watching for changes); "shell.launch" is only for the paths of dropped files.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const files = widget.plugin("fullwidget.files");

const W = {
  choose: t({ "zh-TW": "選擇資料夾", "zh-CN": "选择文件夹", en: "Choose a folder" }),
  chooseText: t({ "zh-TW": "把一個資料夾放在桌面上，裏面的檔案一眼看到", "zh-CN": "把一个文件夹放在桌面上，里面的文件一眼看到", en: "Keep a folder on your desktop and see what's in it" }),
  empty: t({ "zh-TW": "這裏是空的，把檔案拖進來", "zh-CN": "这里是空的，把文件拖进来", en: "Empty. Drop files here" }),
  items: t({ "zh-TW": "{n} 項", "zh-CN": "{n} 项", en: "{n} items" }),
  more: t({ "zh-TW": "只顯示前 2000 項", "zh-CN": "只显示前 2000 项", en: "Showing the first 2000" }),
  dropMove: t({ "zh-TW": "移到這裏", "zh-CN": "移到这里", en: "Move here" }),
  dropCopy: t({ "zh-TW": "複製到這裏", "zh-CN": "复制到这里", en: "Copy here" }),
  dropInto: t({ "zh-TW": "放進「{name}」", "zh-CN": "放进“{name}”", en: "Into “{name}”" }),
  open: t({ "zh-TW": "打開", "zh-CN": "打开", en: "Open" }),
  reveal: t({ "zh-TW": "在檔案總管中顯示", "zh-CN": "在资源管理器中显示", en: "Show in Explorer" }),
  openHere: t({ "zh-TW": "在檔案總管打開這個資料夾", "zh-CN": "在资源管理器打开这个文件夹", en: "Open this folder in Explorer" }),
  copyPath: t({ "zh-TW": "複製路徑", "zh-CN": "复制路径", en: "Copy path" }),
  rename: t({ "zh-TW": "重新命名", "zh-CN": "重命名", en: "Rename" }),
  trash: t({ "zh-TW": "刪除", "zh-CN": "删除", en: "Delete" }),
  trashN: t({ "zh-TW": "刪除 {n} 項", "zh-CN": "删除 {n} 项", en: "Delete {n} items" }),
  newFolder: t({ "zh-TW": "新增資料夾", "zh-CN": "新建文件夹", en: "New folder" }),
  newName: t({ "zh-TW": "新增資料夾", "zh-CN": "新建文件夹", en: "New folder" }),
  refresh: t({ "zh-TW": "重新整理", "zh-CN": "刷新", en: "Refresh" }),
  change: t({ "zh-TW": "換一個資料夾…", "zh-CN": "换一个文件夹…", en: "Choose another folder…" }),
  gone: t({ "zh-TW": "資料夾不見了", "zh-CN": "文件夹不见了", en: "The folder is gone" }),
  missing: t({ "zh-TW": "需要官方插件「檔案」", "zh-CN": "需要官方插件“文件”", en: "Needs the official Files plugin" }),
  where: t({ "zh-TW": "控制中心 → 添加組件 → 線上 → 官方插件", "zh-CN": "控制中心 → 添加组件 → 在线 → 官方插件", en: "Control Center → Add widgets → Online → Official plugins" }),
  allow: t({ "zh-TW": "插件還沒有允許", "zh-CN": "插件还没有允许", en: "The plugin isn't allowed yet" }),
  allowWhere: t({ "zh-TW": "控制中心 → 設定 → 插件", "zh-CN": "控制中心 → 设置 → 插件", en: "Control Center → Settings → Plugins" }),
  broken: t({ "zh-TW": "插件一直停下來", "zh-CN": "插件一直停下来", en: "The plugin keeps stopping" }),
  retry: t({ "zh-TW": "再試一次", "zh-CN": "再试一次", en: "Try again" }),
};
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let opts = widget.settings.get();
let root = null;        // the folder the user picked (full path)
let rootName = "";
let folder = "";        // where we are inside it: "" or "sub/dir"
let items = [];         // what list() gave, sorted
let selected = new Set(); // paths
let anchor = null;      // for shift-click
const icons = new Map(); // "path|modified|size" → data: URI

// ───────────────────────── showing ─────────────────────────

const SIZES = { small: 32, medium: 40, large: 56 };
function iconPx() { return opts.view === "list" ? 18 : SIZES[opts.iconSize] || 40; }

function apply() {
  document.body.dataset.view = opts.view === "list" ? "list" : "grid";
  document.body.style.setProperty("--icon", `${iconPx()}px`);
}

function sortItems(list) {
  const name = new Intl.Collator(widget.locale, { numeric: true, sensitivity: "base" });
  const by = opts.sort;
  return [...list].sort((a, b) => (b.dir - a.dir)
    || (by === "modified" ? b.modified - a.modified : 0)
    || (by === "type" ? name.compare(a.ext, b.ext) : 0)
    || name.compare(a.name, b.name));
}

function crumbs() {
  const parts = folder ? folder.split("/") : [];
  const html = [`<button type="button" class="crumb" data-to="">${esc(rootName)}</button>`];
  parts.forEach((p, i) => html.push(`<span class="sep">›</span><button type="button" class="crumb" data-to="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</button>`));
  $("crumbs").innerHTML = html.join("");
  $("crumbs").title = root + (folder ? "\\" + folder.replace(/\//g, "\\") : "");
  $("back").hidden = !folder;
  // only the last two levels when it's deep
  const all = $("crumbs").children;
  if (parts.length > 2) for (let i = 1; i < (parts.length - 2) * 2 + 1; i++) all[i].hidden = true;
}

function render() {
  crumbs();
  $("count").textContent = items.length ? fmt(W.items, { n: items.length }) : "";
  const px = iconPx();
  $("items").innerHTML = items.map((it) => {
    const src = icons.get(iconKey(it, px));
    return `<div class="item${selected.has(it.path) ? " sel" : ""}${it.dir ? " dir" : ""}" data-path="${esc(it.path)}" title="${esc(it.file)}">
      <span class="ic">${src ? `<img src="${src}" alt="" draggable="false">` : ""}</span><span class="nm">${esc(it.name)}</span></div>`;
  }).join("");
  $("note").hidden = items.length > 0;
  $("note").textContent = W.empty;
  loadIcons();
}

function setSelected(paths) {
  selected = new Set(paths);
  for (const el of $("items").children) el.classList.toggle("sel", selected.has(el.dataset.path));
}

const iconKey = (it, px) => `${it.path}|${it.modified}|${px}`;

/** The icons not fetched yet, a batch at a time. */
async function loadIcons() {
  const px = iconPx();
  const want = items.filter((it) => !icons.has(iconKey(it, px)));
  const size = Math.round(px * Math.min(2, window.devicePixelRatio || 1));
  for (let i = 0; i < want.length; i += 40) {
    const batch = want.slice(i, i + 40);
    let got;
    try { got = await files.call("icons", { root, paths: batch.map((it) => it.path), size }); } catch { return; }
    for (const it of batch) {
      const uri = got[it.path];
      if (!uri) continue;
      icons.set(iconKey(it, px), uri);
      const el = $("items").querySelector(`.item[data-path="${CSS.escape(it.path)}"] .ic`);
      if (el && !el.firstChild) el.innerHTML = `<img src="${uri}" alt="" draggable="false">`;
    }
  }
}

// ───────────────────────── the folder ─────────────────────────

let loadLater = false; // a change came in while a name was being typed: show it afterwards
async function load(keepSelection = true) {
  if (!root) return;
  if (renaming) { loadLater = true; return; }
  let r;
  try { r = await files.call("list", { root, folder }); }
  catch (e) {
    if (folder && /gone|不見|不见/.test(e.message)) { folder = ""; return load(false); }
    return problem(e);
  }
  rootName = r.name;
  items = sortItems(r.items);
  const paths = new Set(items.map((it) => it.path));
  setSelected(keepSelection ? [...selected].filter((p) => paths.has(p)) : []);
  show("box");
  render();
  if (r.more) $("count").textContent = W.more;
}

function go(to) {
  folder = to;
  selected.clear();
  anchor = null;
  widget.storage.set("folder", folder);
  load(false);
}

async function pick() {
  let r;
  try { r = await files.call("pick", { title: W.choose }, { timeout: 600000 }); }
  catch (e) { return problem(e); }
  if (!r) return;
  if (root && root.toLowerCase() !== r.root.toLowerCase()) files.call("unwatch", { root }).catch(() => {});
  root = r.root;
  rootName = r.name;
  folder = "";
  selected.clear();
  icons.clear();
  await widget.storage.set("root", root);
  await widget.storage.set("folder", "");
  await start();
}

async function start() {
  if (!root) return show("setup", W.choose, W.chooseText, W.choose, pick);
  await load(false);
  files.call("watch", { root }).catch(() => {});
}

/** Why the box can't show the folder: the plugin isn't there, or the folder went away. */
function problem(e) {
  const m = e.message || String(e);
  if (/no plugin/.test(m)) return show("setup", W.missing, W.where, W.retry, start);
  if (/allowed yet/.test(m)) return show("setup", W.allow, W.allowWhere, W.retry, start);
  if (/kept stopping/.test(m)) return show("setup", W.broken, W.allowWhere, W.retry, start);
  if (/wasn't picked|没有交给|沒有給|gone|不見|不见/.test(m)) return show("setup", W.gone, root || "", W.choose, pick);
  widget.log("folder box: " + m);
  return show("setup", m, "", W.retry, start);
}

let setupAction = null;
function show(which, title, text, button, action) {
  const setup = which === "setup";
  $("setup").hidden = !setup;
  $("box").hidden = setup;
  document.querySelector(".head").hidden = setup;
  if (!setup) return;
  $("setup-title").textContent = title;
  $("setup-text").textContent = text;
  $("setup-btn").hidden = !button;
  $("setup-btn").textContent = button || "";
  setupAction = action;
}
$("setup-btn").addEventListener("click", () => setupAction && setupAction());

// the plugin says something in a folder changed (ours, or another box's)
files.on("changed", (d) => { if (root && d && d.root && d.root.toLowerCase() === root.toLowerCase()) load(); });

// ───────────────────────── clicking ─────────────────────────

const itemOf = (el) => el && el.closest && el.closest(".item");
const byPath = (p) => items.find((it) => it.path === p);

$("items").addEventListener("click", (e) => {
  const el = itemOf(e.target);
  if (!el) return;
  const p = el.dataset.path;
  if (e.shiftKey && anchor) {
    const a = items.findIndex((it) => it.path === anchor), b = items.findIndex((it) => it.path === p);
    setSelected(items.slice(Math.min(a, b), Math.max(a, b) + 1).map((it) => it.path));
  } else if (e.ctrlKey) {
    const next = new Set(selected);
    next.has(p) ? next.delete(p) : next.add(p);
    setSelected([...next]);
    anchor = p;
  } else {
    setSelected([p]);
    anchor = p;
  }
});

$("box").addEventListener("click", (e) => { if (!itemOf(e.target) && !e.ctrlKey && !e.shiftKey) setSelected([]); });

$("items").addEventListener("dblclick", (e) => {
  const el = itemOf(e.target);
  if (el) openItem(byPath(el.dataset.path));
});

function openItem(it) {
  if (!it) return;
  if (it.dir && opts.folders !== "explorer") return go(it.path);
  files.call("open", { root, path: it.path }).catch((e) => widget.log("open: " + e.message));
}

$("back").addEventListener("click", () => go(folder.split("/").slice(0, -1).join("/")));
$("crumbs").addEventListener("click", (e) => {
  const c = e.target.closest(".crumb");
  if (c && c.dataset.to !== folder) go(c.dataset.to);
});

$("box").addEventListener("keydown", (e) => {
  if (renaming) return;
  const sel = [...selected];
  if (e.key === "Enter" && sel.length === 1) openItem(byPath(sel[0]));
  else if (e.key === "Delete" && sel.length) trash(sel);
  else if (e.key === "F2" && sel.length === 1) rename(sel[0]);
  else if (e.key === "Backspace" && folder) go(folder.split("/").slice(0, -1).join("/"));
  else if (e.key === "a" && e.ctrlKey) { e.preventDefault(); setSelected(items.map((it) => it.path)); }
  else if (e.key === "F5") { e.preventDefault(); load(); }
});

// ───────────────────────── dragging out ─────────────────────────

let press = null;      // where a press on an item started
let draggingOut = false;
let dropLater = null;  // a drop on ourselves while our own drag is still running

$("items").addEventListener("pointerdown", (e) => {
  const el = itemOf(e.target);
  if (e.button !== 0 || !el || renaming) return;
  press = { x: e.clientX, y: e.clientY, path: el.dataset.path };
});
window.addEventListener("pointerup", () => { press = null; });
window.addEventListener("pointermove", async (e) => {
  if (!press || !(e.buttons & 1) || draggingOut) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
  const paths = selected.has(press.path) ? [...selected] : [press.path];
  if (!selected.has(press.path)) setSelected([press.path]);
  press = null;
  draggingOut = true;
  document.body.classList.add("dragging-out");
  try { await files.call("drag", { root, paths }, { timeout: 600000 }); }
  catch (err) { widget.log("drag: " + err.message); }
  finally {
    draggingOut = false;
    document.body.classList.remove("dragging-out");
    if (dropLater) { const d = dropLater; dropLater = null; addFiles(d.paths, d.to, d.mode); }
  }
});

// ───────────────────────── dropping in ─────────────────────────

let depth = 0;
const dropTarget = (e) => {
  const el = itemOf(e.target);
  const it = el && byPath(el.dataset.path);
  return it && it.dir ? it : null;
};
const dropMode = (e) => (e.ctrlKey ? "copy" : e.shiftKey ? "move" : "auto");

function hasFiles(e) { return e.dataTransfer && [...e.dataTransfer.types].includes("Files"); }

document.addEventListener("dragenter", (e) => { if (hasFiles(e) && root) { depth++; document.body.classList.add("dropping"); } });
document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; document.body.classList.remove("dropping"); markInto(null); } });
document.addEventListener("dragover", (e) => {
  if (!hasFiles(e) || !root) return;
  e.preventDefault();
  const into = dropTarget(e);
  markInto(into);
  const mode = dropMode(e);
  e.dataTransfer.dropEffect = mode === "copy" ? "copy" : "move";
  $("drop-text").textContent = into ? fmt(W.dropInto, { name: into.name }) : mode === "copy" ? W.dropCopy : W.dropMove;
});
document.addEventListener("drop", async (e) => {
  if (!hasFiles(e) || !root) return;
  e.preventDefault();
  depth = 0;
  document.body.classList.remove("dropping");
  const into = dropTarget(e);
  markInto(null);
  const to = into ? into.path : folder;
  const mode = dropMode(e);
  let paths;
  try { paths = await widget.shell.paths(e.dataTransfer.files); } catch (err) { return widget.log("drop: " + err.message); }
  if (!paths.length) return;
  if (draggingOut) dropLater = { paths, to, mode }; // our own drag: Windows is still busy with it
  else addFiles(paths, to, mode);
});

let intoEl = null;
function markInto(it) {
  const el = it ? $("items").querySelector(`.item[data-path="${CSS.escape(it.path)}"]`) : null;
  if (el === intoEl) return;
  if (intoEl) intoEl.classList.remove("into");
  intoEl = el;
  if (el) el.classList.add("into");
}

async function addFiles(paths, to, mode) {
  try { await files.call("add", { root, folder: to, files: paths, mode }, { timeout: 600000 }); }
  catch (e) { widget.log("add: " + e.message); }
  load();
}

// ───────────────────────── the menu ─────────────────────────

const menu = $("menu");
$("box").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const el = itemOf(e.target);
  if (el && !selected.has(el.dataset.path)) setSelected([el.dataset.path]);
  const sel = el ? [...selected] : [];
  const entries = sel.length
    ? [
      sel.length === 1 && [W.open, () => openItem(byPath(sel[0]))],
      sel.length === 1 && [W.reveal, () => files.call("reveal", { root, path: sel[0] })],
      [W.copyPath, () => files.call("copyPath", { root, paths: sel })],
      "-",
      sel.length === 1 && [W.rename, () => rename(sel[0])],
      [sel.length > 1 ? fmt(W.trashN, { n: sel.length }) : W.trash, () => trash(sel), "danger"],
    ]
    : [
      [W.newFolder, newFolder],
      [W.openHere, () => files.call("open", { root, path: folder })],
      [W.refresh, () => load()],
      "-",
      [W.change, pick],
    ];
  openMenu(entries.filter(Boolean), e.clientX, e.clientY);
});

function openMenu(entries, x, y) {
  menu.innerHTML = entries.map((m, i) => m === "-" ? `<hr>` : `<button type="button" role="menuitem" data-i="${i}" class="${m[2] || ""}">${esc(m[0])}</button>`).join("");
  menu.hidden = false;
  menu.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    closeMenu();
    const run = entries[+b.dataset.i][1];
    Promise.resolve(run()).catch((err) => widget.log("menu: " + err.message));
  };
  // inside the card (the window around it is mostly shadow)
  const r = menu.getBoundingClientRect(), card = document.body.getBoundingClientRect();
  menu.style.left = `${Math.max(card.left + 4, Math.min(x, card.right - r.width - 4))}px`;
  menu.style.top = `${Math.max(card.top + 4, Math.min(y, card.bottom - r.height - 4))}px`;
  menu.querySelector("button")?.focus({ preventScroll: true });
}
function closeMenu() { menu.hidden = true; }
document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
window.addEventListener("blur", closeMenu);

// ───────────────────────── changing things ─────────────────────────

let renaming = false;
function rename(path, fresh = false) {
  const el = $("items").querySelector(`.item[data-path="${CSS.escape(path)}"]`);
  const it = byPath(path);
  if (!el || !it) return;
  renaming = true;
  const nm = el.querySelector(".nm");
  const input = document.createElement("input");
  input.className = "w-input rn";
  input.value = it.file;
  input.spellcheck = false;
  nm.replaceWith(input);
  input.focus();
  // the name without its extension, as Explorer does
  const dot = it.dir ? -1 : it.file.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : it.file.length);
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    renaming = false;
    loadLater = false;
    const name = input.value.trim();
    if (save && name && name !== it.file) {
      try {
        const to = await files.call("rename", { root, path, name });
        selected = new Set([to]);
      } catch (e) { widget.log("rename: " + e.message); flash(e.message); }
    }
    load();
    $("box").focus({ preventScroll: true });
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
}

async function trash(paths) {
  try { await files.call("trash", { root, paths }); } catch (e) { widget.log("trash: " + e.message); flash(e.message); }
  setSelected([]);
  load();
}

async function newFolder() {
  try {
    const path = await files.call("mkdir", { root, folder, name: W.newName });
    selected = new Set([path]);
    await load();
    rename(path);
  } catch (e) { flash(e.message); }
}

let flashTimer = 0;
function flash(text) {
  $("count").textContent = text;
  $("count").classList.add("err");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $("count").classList.remove("err"); $("count").textContent = items.length ? fmt(W.items, { n: items.length }) : ""; }, 4000);
}

// ───────────────────────── start ─────────────────────────

widget.settings.onChange((all) => {
  const was = opts;
  opts = all;
  apply();
  if (was.sort !== all.sort) items = sortItems(items);
  render();
});

apply();
(async () => {
  root = await widget.storage.get("root");
  folder = (await widget.storage.get("folder")) || "";
  await start();
})();
