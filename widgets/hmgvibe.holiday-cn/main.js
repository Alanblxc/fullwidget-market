// 放假倒计时: mainland China's public holidays from the State Council's schedule, as collected in
// github.com/NateScarlet/holiday-cn (fetched through jsDelivr, or GitHub when that fails), kept
// for offline use. Days not in the schedule are workdays Monday to Friday and rest days at weekends.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const en = widget.locale.toLowerCase().startsWith("en");
const W = {
  next: t({ "zh-TW": "下一個假期", "zh-CN": "下一个假期", en: "Next holiday" }),
  now: t({ "zh-TW": "正在放假", "zh-CN": "正在放假", en: "On holiday" }),
  daysTo: t({ "zh-TW": "天後", "zh-CN": "天后", en: "days to go" }),
  tomorrowStarts: t({ "zh-TW": "明天開始", "zh-CN": "明天开始", en: "starts tomorrow" }),
  daysLeft: t({ "zh-TW": "天假還在", "zh-CN": "天假还在", en: "days left" }),
  lastDay: t({ "zh-TW": "最後一天", "zh-CN": "最后一天", en: "last day" }),
  span: t({ "zh-TW": "{from}–{to} · 放 {n} 天", "zh-CN": "{from}–{to} · 放 {n} 天", en: "{from} – {to} · {n} days off" }),
  one: t({ "zh-TW": "{from} · 放 1 天", "zh-CN": "{from} · 放 1 天", en: "{from} · 1 day off" }),
  backTo: t({ "zh-TW": "{date}上班", "zh-CN": "{date}上班", en: "Back to work {date}" }),
  makeup: t({ "zh-TW": "調休上班：", "zh-CN": "调休上班：", en: "Working weekend days: " }),
  today: t({ "zh-TW": "今天", "zh-CN": "今天", en: "Today" }),
  tomorrow: t({ "zh-TW": "明天", "zh-CN": "明天", en: "Tomorrow" }),
  work: t({ "zh-TW": "上班", "zh-CN": "上班", en: "work" }),
  rest: t({ "zh-TW": "休息", "zh-CN": "休息", en: "off" }),
  makeupDay: t({ "zh-TW": "調休上班", "zh-CN": "调休上班", en: "work (swapped)" }),
  none: t({ "zh-TW": "明年的安排還沒公布", "zh-CN": "明年的安排还没公布", en: "Next year's schedule isn't out yet" }),
  offline: t({ "zh-TW": "還拿不到假期安排", "zh-CN": "还拿不到假期安排", en: "No holiday schedule yet" }),
  offlineWhy: t({ "zh-TW": "連上網後會自動更新", "zh-CN": "联网后会自动更新", en: "It updates once you're online" }),
};
const NAMES_EN = { "元旦": "New Year's Day", "春节": "Spring Festival", "清明节": "Qingming Festival", "劳动节": "Labour Day", "端午节": "Dragon Boat Festival", "中秋节": "Mid-Autumn Festival", "国庆节": "National Day", "国庆节、中秋节": "National Day & Mid-Autumn" };
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
let opts = widget.settings.get();
let schedule = {}; // "2027-01-01" → { name, off }
let years = {};    // year → { days: [...] | null (not published), at }

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayAt = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const between = (a, b) => Math.round((b - a) / 864e5);

const traditional = new Map();
async function holidayName(name) {
  if (en) return NAMES_EN[name] || name;
  if (!/^zh-(tw|hk|mo|hant)/i.test(widget.locale)) return name;
  if (!traditional.has(name)) { try { traditional.set(name, await widget.convertChinese(name, "traditional")); } catch { return name; } }
  return traditional.get(name);
}

const dateText = (d, weekday = false) =>
  new Intl.DateTimeFormat(widget.locale, { month: "short", day: "numeric", ...(weekday ? { weekday: "short" } : {}) }).format(d);

/** What a day is: { off, makeup? }. */
function status(d) {
  const e = schedule[iso(d)];
  if (e) return { off: e.off, makeup: !e.off };
  const wd = d.getDay();
  return { off: wd === 0 || wd === 6 };
}

/** The holidays in the schedule, in order: [{ name, start, end, makeup: [working weekend days] }]. */
function holidays() {
  const list = [];
  const keys = Object.keys(schedule).sort();
  for (const k of keys) {
    const e = schedule[k];
    if (!e.off) continue;
    const d = dayAt(k), last = list[list.length - 1];
    if (last && last.name === e.name && between(last.end, d) === 1) last.end = d;
    else list.push({ name: e.name, start: d, end: d, makeup: [] });
  }
  // a working weekend day belongs to the holiday of the same name nearest to it
  for (const k of keys) {
    const e = schedule[k];
    if (e.off) continue;
    const d = dayAt(k);
    const near = list.filter((h) => h.name === e.name).sort((a, b) => Math.abs(between(d, a.start)) - Math.abs(between(d, b.start)))[0];
    if (near) near.makeup.push(d);
  }
  return list;
}

async function render() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const h = holidays().find((x) => x.end >= today);
  const on = h && h.start <= today;
  $("label").textContent = on ? W.now : W.next;
  if (!h) {
    const known = Object.keys(schedule).length > 0;
    $("name").textContent = known ? W.none : W.offline;
    $("days").textContent = "";
    $("unit").textContent = "";
    $("when").textContent = known ? "" : W.offlineWhy;
    $("makeup").hidden = true;
  } else {
    $("name").textContent = await holidayName(h.name);
    const len = between(h.start, h.end) + 1;
    if (on) {
      const left = between(today, h.end) + 1;
      $("days").textContent = left;
      $("unit").textContent = left === 1 ? W.lastDay : W.daysLeft;
      $("when").textContent = fmt(W.backTo, { date: dateText(addDays(h.end, 1), true) });
    } else {
      const n = between(today, h.start);
      $("days").textContent = n;
      $("unit").textContent = n === 1 ? W.tomorrowStarts : W.daysTo;
      $("when").textContent = len === 1 ? fmt(W.one, { from: dateText(h.start) }) : fmt(W.span, { from: dateText(h.start), to: dateText(h.end), n: len });
    }
    const mk = h.makeup.filter((d) => d >= today);
    $("makeup").hidden = !opts.showMakeup || !mk.length;
    $("makeup").textContent = W.makeup + mk.map((d) => dateText(d, true)).join(en ? ", " : "、");
  }
  const chip = (label, d) => {
    const s = status(d);
    return `<span class="chip ${s.off ? "off" : s.makeup ? "makeup" : "work"}"><b>${label}</b>${s.off ? W.rest : s.makeup ? W.makeupDay : W.work}</span>`;
  };
  $("chips").innerHTML = chip(W.today, today) + chip(W.tomorrow, addDays(today, 1));
}

// ───────────────────────── the schedule ─────────────────────────

const SOURCES = [
  (y) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
];

/** A year's days, null when it isn't published yet; throws when no source answers. */
async function fetchYear(y) {
  for (const src of SOURCES) {
    try {
      const r = await widget.fetch(src(y), { timeout: 15000 });
      if (r.status === 404) return null;
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j.days)) return j.days;
    } catch { /* try the next source */ }
  }
  throw new Error("offline");
}

function rebuild() {
  schedule = {};
  for (const y of Object.keys(years).sort()) for (const d of years[y].days || []) schedule[d.date] = { name: d.name, off: !!d.isOffDay };
}

async function refresh() {
  const y = new Date().getFullYear();
  let changed = false;
  for (const year of [y, y + 1]) {
    const have = years[year];
    // a published year is checked weekly (corrections are rare); next year's daily until it's out
    if (have && Date.now() - have.at < (have.days ? 7 : 1) * 864e5) continue;
    try {
      years[year] = { days: await fetchYear(year), at: Date.now() };
      changed = true;
    } catch { /* offline: keep what we had */ }
  }
  for (const k of Object.keys(years)) if (+k < y - 1) { delete years[k]; changed = true; }
  if (changed) { await widget.storage.set("years", years); rebuild(); }
  render();
}

(async () => {
  years = (await widget.storage.get("years")) || {};
  rebuild();
  await render();
  refresh();
})();

// a new day just after midnight; the schedule now and then
function atMidnight() {
  const now = new Date();
  setTimeout(() => { render(); atMidnight(); }, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5) - now);
}
atMidnight();
setInterval(refresh, 6 * 3600e3);
widget.settings.onChange((all) => { opts = all; render(); });
