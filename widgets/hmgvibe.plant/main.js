// 桌面小植物: a plant drawn in SVG from how many days it has been watered (it grows a step for
// each day) and how long ago it last was (it droops when thirsty and perks up when watered).
const $ = (id) => document.getElementById(id);
const t = widget.t;
const W = {
  water: t({ "zh-TW": "澆水", "zh-CN": "浇水", en: "Water" }),
  done: t({ "zh-TW": "澆過了", "zh-CN": "浇过了", en: "Watered" }),
  day: t({ "zh-TW": "第 {n} 天", "zh-CN": "第 {n} 天", en: "Day {n}" }),
  seed: t({ "zh-TW": "剛種下，澆點水吧", "zh-CN": "刚种下，浇点水吧", en: "Just planted. Give it some water" }),
  happy: t({ "zh-TW": "喝飽了，精神很好", "zh-CN": "喝饱了，精神很好", en: "Watered and happy" }),
  fine: t({ "zh-TW": "長得不錯", "zh-CN": "长得不错", en: "Doing well" }),
  thirsty: t({ "zh-TW": "有點渴了", "zh-CN": "有点渴了", en: "A little thirsty" }),
  wilted: t({ "zh-TW": "渴壞了，快澆水", "zh-CN": "渴坏了，快浇水", en: "Very thirsty. Water me!" }),
  bloomIn: t({ "zh-TW": "再澆 {n} 天就開花", "zh-CN": "再浇 {n} 天就开花", en: "{n} more days to bloom" }),
  bloomed: t({ "zh-TW": "開花了", "zh-CN": "开花了", en: "In bloom" }),
};
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let opts = widget.settings.get();
let state = null; // { born: "2026-11-15", days: ["2026-11-15", …], last: ms }
const BLOOM = { sunflower: 16, cactus: 20 };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayAt = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/** 0 (just watered) … 1 (fine) … 2 (thirsty) … 3 (wilted), in steps; cacti drink a third as often. */
function thirst() {
  if (!state.last) return 1;
  const hours = (Date.now() - state.last) / 36e5 / (opts.kind === "cactus" ? 3 : 1);
  return hours < 6 ? 0 : hours < 30 ? 1 : hours < 60 ? 2 : 3;
}

// ───────────────────────── drawing ─────────────────────────

const mix = (a, b, k) => {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("");
};

/** A leaf from (0,0) pointing along +x, `len` long and `wid` wide, turned by `deg`. */
function leaf(x, y, len, wid, deg, fill, vein) {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})">
    <path d="M0 0C${len * 0.3} ${-wid} ${len * 0.75} ${-wid * 0.9} ${len} 0C${len * 0.75} ${wid * 0.9} ${len * 0.3} ${wid} 0 0z" fill="${fill}"/>
    <path d="M${len * 0.08} 0L${len * 0.85} 0" stroke="${vein}" stroke-width="0.7" stroke-linecap="round" fill="none"/></g>`;
}

function drawLeafy(g, droop, green, dark) {
  const grow = 1 - Math.exp(-g / 9);
  const H = 10 + 62 * grow;
  const top = 91 - H;
  const bend = droop * 5;
  let s = `<path d="M60 91C60 ${91 - H * 0.4} ${60 + bend * 0.6} ${top + H * 0.3} ${60 + bend} ${top}" stroke="${dark}" stroke-width="${(1.6 + grow * 1.6).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
  const n = Math.min(9, 2 + Math.floor(g * 0.55));
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / (n + 1);
    const y = 91 - H * (0.18 + k * 0.72);
    const x = 60 + bend * k * k;
    const right = i % 2 === 0;
    const size = (9 + 16 * grow) * (1.1 - k * 0.45);
    const angle = right ? -28 + droop * 22 + k * 8 : 208 - droop * 22 - k * 8;
    s += leaf(x, y, size, size * 0.42, angle, i % 3 === 1 ? dark : green, dark);
  }
  // two young leaves at the tip
  s += leaf(60 + bend, top, 6 + grow * 4, 2.6, -62 + droop * 30, green, dark) + leaf(60 + bend, top, 6 + grow * 4, 2.6, 242 - droop * 30, green, dark);
  return s;
}

function drawSunflower(g, droop, green, dark) {
  const grow = 1 - Math.exp(-g / 8);
  const H = 12 + 66 * grow;
  const top = 91 - H;
  const bend = droop * 9;
  let s = `<path d="M60 91C60 ${91 - H * 0.5} ${60 + bend * 0.4} ${top + H * 0.25} ${60 + bend} ${top}" stroke="${dark}" stroke-width="${(1.8 + grow * 1.8).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
  const n = Math.min(6, 2 + Math.floor(g / 3));
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / (n + 1.6);
    const y = 91 - H * (0.12 + k * 0.7);
    const right = i % 2 === 0;
    const size = (10 + 14 * grow) * (1.15 - k * 0.5);
    s += leaf(60 + bend * k * k, y, size, size * 0.55, right ? -22 + droop * 26 : 202 - droop * 26, green, dark);
  }
  const fx = 60 + bend, fy = top;
  if (g >= BLOOM.sunflower) {
    const r = 7 + grow * 6, tilt = droop * 28;
    let petals = "";
    for (let i = 0; i < 14; i++) petals += `<ellipse cx="0" cy="${-r - 3.2}" rx="2.4" ry="${4.4 + grow}" transform="rotate(${i * 360 / 14})" fill="${droop > 1 ? "#d9b54a" : "#ffcf3d"}"/>`;
    s += `<g transform="translate(${fx} ${fy}) rotate(${tilt}) scale(1 ${(1 - droop * 0.12).toFixed(2)})">${petals}<circle r="${r}" fill="#7a4a24"/><circle r="${r * 0.62}" fill="#5b3519"/></g>`;
  } else if (g >= BLOOM.sunflower - 6) {
    s += `<g transform="translate(${fx} ${fy}) rotate(${droop * 20})"><ellipse rx="4" ry="5" fill="${dark}"/><path d="M-3-3l3-4 3 4" fill="${green}"/></g>`;
  } else {
    s += leaf(fx, fy, 6, 2.5, -70 + droop * 30, green, dark) + leaf(fx, fy, 6, 2.5, 250 - droop * 30, green, dark);
  }
  return s;
}

function drawCactus(g, droop, green, dark) {
  const grow = 1 - Math.exp(-g / 10);
  const H = 12 + 50 * grow, w = 10 + 8 * grow;
  const lean = droop * 4;
  const body = (x, y, ww, hh) => `<rect x="${(x - ww / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${hh.toFixed(1)}" rx="${(ww / 2).toFixed(1)}" fill="${green}"/>`;
  let s = `<g transform="rotate(${lean} 60 91)">`;
  if (g >= 8) {
    const ay = 91 - H * 0.55, ah = H * 0.32;
    s += `<path d="M${60 - w / 2} ${ay + 6}h-7a3 3 0 0 0-3 3v0" stroke="${green}" stroke-width="${(w * 0.55).toFixed(1)}" stroke-linecap="round" fill="none"/>` + body(60 - w / 2 - 10, ay - ah + 6, w * 0.55, ah);
  }
  if (g >= 14) {
    const ay = 91 - H * 0.72, ah = H * 0.26;
    s += `<path d="M${60 + w / 2} ${ay + 6}h7" stroke="${green}" stroke-width="${(w * 0.55).toFixed(1)}" stroke-linecap="round" fill="none"/>` + body(60 + w / 2 + 9, ay - ah + 6, w * 0.55, ah);
  }
  s += body(60, 91 - H, w, H + 4);
  // ribs and spines
  for (const dx of [-w * 0.22, w * 0.22]) s += `<path d="M${(60 + dx).toFixed(1)} ${(91 - H + w * 0.4).toFixed(1)}V89" stroke="${dark}" stroke-width="0.8" stroke-linecap="round" opacity="0.6"/>`;
  for (let y = 91 - H + 6; y < 88; y += 7) for (const dx of [-w / 2, w / 2]) s += `<path d="M${(60 + dx).toFixed(1)} ${y}l${dx > 0 ? 2.2 : -2.2} -1" stroke="#f1ecd9" stroke-width="0.6" stroke-linecap="round"/>`;
  if (g >= BLOOM.cactus) {
    let f = "";
    for (let i = 0; i < 6; i++) f += `<ellipse cx="0" cy="-3.6" rx="1.8" ry="3.4" transform="rotate(${i * 60})" fill="#ff7aa8"/>`;
    s += `<g transform="translate(60 ${91 - H})">${f}<circle r="1.7" fill="#ffd35c"/></g>`;
  }
  return s + "</g>";
}

function draw() {
  const g = state.days.length;
  const th = thirst();
  const droop = [0, 0, 0.6, 1.4][th];
  const kind = opts.kind || "leafy";
  const base = kind === "cactus" ? ["#58b07a", "#3d8a5a"] : ["#5fbf72", "#3c9452"];
  const dry = th >= 2 ? (th === 2 ? 0.25 : 0.55) : 0;
  const green = mix(base[0], "#b9a95a", dry), dark = mix(base[1], "#8f7f3e", dry);
  let s;
  if (g === 0) s = `<ellipse cx="60" cy="90" rx="3.2" ry="2" fill="#a77a4f"/>` + leaf(60, 89, 4.5, 1.8, -60, green, dark) + leaf(60, 89, 4.5, 1.8, 240, green, dark);
  else s = kind === "sunflower" ? drawSunflower(g, droop, green, dark) : kind === "cactus" ? drawCactus(g, droop, green, dark) : drawLeafy(g, droop, green, dark);
  $("plant").innerHTML = s;
  $("soil").setAttribute("fill", th <= 1 ? "#5a3d2b" : th === 2 ? "#7a5a3f" : "#9a7b58");

  const born = dayAt(state.born);
  const today = new Date();
  const n = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - born) / 864e5) + 1;
  $("name").textContent = opts.name || "";
  $("day").textContent = fmt(W.day, { n });
  const wateredToday = state.days.includes(iso(today));
  const btn = $("water");
  btn.textContent = wateredToday ? `${W.done} ✓` : W.water;
  btn.disabled = wateredToday && th === 0;
  btn.classList.toggle("is-primary", !wateredToday);
  let mood = g === 0 && !state.last ? W.seed : [W.happy, W.fine, W.thirsty, W.wilted][th];
  const bloom = BLOOM[kind];
  if (bloom && th <= 1) mood = g >= bloom ? W.bloomed : g >= bloom - 7 ? fmt(W.bloomIn, { n: bloom - g }) : mood;
  $("mood").textContent = mood;
  $("mood").className = `mood t${th}`;
}

// ───────────────────────── watering ─────────────────────────

async function water() {
  const today = iso(new Date());
  if (!state.days.includes(today)) state.days.push(today);
  state.days = state.days.slice(-400);
  state.last = Date.now();
  await widget.storage.set("plant", state);
  const scene = $("scene");
  scene.classList.remove("watering");
  void scene.getBoundingClientRect(); // restart the drops
  scene.classList.add("watering");
  setTimeout(() => scene.classList.remove("watering"), 1400);
  draw();
}
$("water").addEventListener("click", water);

(async () => {
  state = (await widget.storage.get("plant")) || { born: iso(new Date()), days: [], last: 0 };
  if (!state.born) state.born = iso(new Date());
  draw();
  // thirst creeps up: look again every ten minutes
  setInterval(draw, 10 * 60e3);
})();
widget.settings.onChange((all) => { opts = all; if (state) draw(); });
