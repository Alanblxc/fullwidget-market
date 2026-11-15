// 抽签: draws from the user's list, rolls dice or flips a coin, with a short shuffle before the
// answer (about a second; nothing moves otherwise). Randomness from crypto.getRandomValues.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const W = {
  draw: t({ "zh-TW": "抽籤", "zh-CN": "抽签", en: "Draw" }),
  dice: t({ "zh-TW": "擲骰子", "zh-CN": "掷骰子", en: "Roll" }),
  coin: t({ "zh-TW": "拋硬幣", "zh-CN": "抛硬币", en: "Flip a coin" }),
  tap: t({ "zh-TW": "點一下", "zh-CN": "点一下", en: "Tap" }),
  again: t({ "zh-TW": "再來一次", "zh-CN": "再来一次", en: "Again" }),
  heads: t({ "zh-TW": "正面", "zh-CN": "正面", en: "Heads" }),
  tails: t({ "zh-TW": "反面", "zh-CN": "反面", en: "Tails" }),
  empty: t({ "zh-TW": "在設定裏寫上要抽的東西", "zh-CN": "在设置里写上要抽的东西", en: "Add your choices in the settings" }),
  total: t({ "zh-TW": "共 {n}", "zh-CN": "共 {n}", en: "{n} total" }),
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let opts = widget.settings.get();
let history = [];
let rolling = false;

const rand = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const items = () => String(opts.items || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const mode = () => (["draw", "dice", "coin"].includes(opts.mode) ? opts.mode : "draw");

// a die's pips on a 3×3 grid
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n) => `<span class="die">${[...Array(9)].map((_, i) => `<i${PIPS[n].includes(i) ? ' class="on"' : ""}></i>`).join("")}</span>`;

function face(m, v) {
  if (m === "dice") return `<span class="dice">${v.map(die).join("")}</span>`;
  if (m === "coin") return `<span class="coin ${v ? "heads" : "tails"}"><b>${v ? W.heads : W.tails}</b></span>`;
  return `<span class="pick">${esc(v)}</span>`;
}

function pickOne(m) {
  if (m === "dice") return [...Array(Math.min(3, Math.max(1, +opts.dice || 2)))].map(() => rand(6) + 1);
  if (m === "coin") return rand(2) === 0;
  const list = items();
  return list.length ? list[rand(list.length)] : null;
}

function idle() {
  const m = mode();
  document.body.dataset.mode = m;
  $("mode").textContent = { draw: W.draw, dice: W.dice, coin: W.coin }[m];
  if (m === "draw" && !items().length) { $("result").innerHTML = `<span class="empty">${W.empty}</span>`; $("hint").textContent = ""; return; }
  const last = history[0];
  const idlePic = m === "dice" ? `<span class="dice idle">${die(5)}</span>` : m === "coin" ? `<span class="coin heads idle"><b>?</b></span>` : `<span class="q">?</span>`;
  $("result").innerHTML = last && last.m === m ? face(m, last.v) : `<span class="tapwrap">${idlePic}<span class="tap">${W.tap}</span></span>`;
  $("hint").textContent = last && last.m === m ? W.again : "";
  showHistory();
}

function showHistory() {
  const m = mode();
  const label = (h) => (h.m === "dice" ? (h.v.length > 1 ? h.v.join("+") + "=" + h.v.reduce((a, b) => a + b, 0) : h.v[0]) : h.m === "coin" ? (h.v ? W.heads : W.tails) : h.v);
  $("history").innerHTML = history.filter((h) => h.m === m).slice(1, 5).map((h) => `<span>${esc(label(h))}</span>`).join("");
}

async function go() {
  if (rolling) return;
  const m = mode();
  if (m === "draw" && !items().length) return;
  rolling = true;
  document.body.classList.add("rolling");
  // a short shuffle that slows down, then the answer
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    $("result").innerHTML = face(m, pickOne(m));
    await new Promise((r) => setTimeout(r, 40 + i * i * 4));
  }
  const v = pickOne(m);
  history.unshift({ m, v });
  history = history.slice(0, 12);
  widget.storage.set("history", history);
  document.body.classList.remove("rolling");
  $("result").innerHTML = face(m, v);
  const r = $("result").firstElementChild;
  if (r) r.classList.add("land");
  if (m === "dice" && v.length > 1) $("hint").textContent = W.total.replace("{n}", v.reduce((a, b) => a + b, 0));
  else $("hint").textContent = W.again;
  showHistory();
  rolling = false;
}
$("stage").addEventListener("click", go);

(async () => {
  history = (await widget.storage.get("history")) || [];
  idle();
})();
widget.settings.onChange((all) => { opts = all; if (!rolling) idle(); });
