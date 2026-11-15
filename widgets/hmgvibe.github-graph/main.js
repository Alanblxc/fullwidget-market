// GitHub 贡献墙: the contribution calendar GitHub shows on a profile, read from its public page
// (github.com/users/<name>/contributions, no sign-in), as many weeks as fit the card.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const W = {
  total: t({ "zh-TW": "一年 {n} 次", "zh-CN": "一年 {n} 次", en: "{n} this year" }),
  streak: t({ "zh-TW": "連續 {n} 天", "zh-CN": "连续 {n} 天", en: "{n}-day streak" }),
  noUser: t({ "zh-TW": "在設定裏填上 GitHub 用戶名", "zh-CN": "在设置里填上 GitHub 用户名", en: "Add your GitHub username in the settings" }),
  notFound: t({ "zh-TW": "找不到用戶「{u}」", "zh-CN": "找不到用户“{u}”", en: "No user “{u}”" }),
  offline: t({ "zh-TW": "連不上 GitHub", "zh-CN": "连不上 GitHub", en: "Can't reach GitHub" }),
  day: t({ "zh-TW": "{date}：{n} 次", "zh-CN": "{date}：{n} 次", en: "{date}: {n}" }),
};
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
let opts = widget.settings.get();
let data = null; // { user, days: [[ "2026-01-01", level, count ], …], at }

function parse(html) {
  const days = [];
  const counts = new Map();
  // <tool-tip for="contribution-day-component-3-12">5 contributions on March 3rd.</tool-tip>
  for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = /^\s*(\d[\d,]*)\s+contribution/.exec(m[2]);
    counts.set(m[1], n ? +n[1].replace(/,/g, "") : 0);
  }
  for (const m of html.matchAll(/<td\b[^>]*\bdata-date="(\d{4}-\d\d-\d\d)"[^>]*>/g)) {
    const td = m[0];
    const id = /\bid="([^"]+)"/.exec(td)?.[1];
    const level = +(/\bdata-level="(\d)"/.exec(td)?.[1] || 0);
    days.push([m[1], level, counts.get(id) ?? (level ? 1 : 0)]);
  }
  return days.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

async function refresh() {
  const user = String(opts.user || "").trim().replace(/^@/, "");
  if (!user) return render();
  try {
    const r = await widget.fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`);
    if (r.status === 404) { data = { user, missing: true, days: [], at: Date.now() }; return render(); }
    if (!r.ok) throw new Error(r.status);
    const days = parse(await r.text());
    if (!days.length) throw new Error("nothing on the page");
    data = { user, days, at: Date.now() };
    await widget.storage.set("data", data);
  } catch (e) {
    widget.log("github: " + e.message);
    if (!data || data.user !== user) data = { user, offline: true, days: [], at: 0 };
  }
  render();
}

function render() {
  const user = String(opts.user || "").trim().replace(/^@/, "");
  const msg = (text) => { $("msg").hidden = !text; $("msg").textContent = text || ""; $("grid").hidden = !!text; };
  $("user").textContent = user ? `@${user}` : "GitHub";
  $("total").textContent = "";
  $("streak").textContent = "";
  if (!user) return msg(W.noUser);
  if (!data || data.user !== user) return msg("…");
  if (data.missing) return msg(fmt(W.notFound, { u: user }));
  if (!data.days.length) return msg(W.offline);
  msg("");

  const days = data.days;
  const total = days.reduce((s, d) => s + d[2], 0);
  // the streak counts back from today (or yesterday, if nothing yet today)
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i][2] > 0) streak++;
    else if (i === days.length - 1) continue;
    else break;
  }
  $("total").textContent = fmt(W.total, { n: total.toLocaleString(widget.locale) });
  $("streak").textContent = streak ? fmt(W.streak, { n: streak }) : "";

  // as many whole weeks as fit: columns of 7 days, Sunday at the top like GitHub
  const grid = $("grid");
  const cell = parseFloat(getComputedStyle(grid).getPropertyValue("--cell")) || 10;
  const gap = parseFloat(getComputedStyle(grid).getPropertyValue("--gap")) || 3;
  const weeks = Math.max(4, Math.floor((grid.clientWidth + gap) / (cell + gap)));
  const first = new Date(days[0][0]);
  const pad = (first.getDay() + 7) % 7; // GitHub's first column may start mid-week
  const cells = [...Array(pad).fill(null), ...days];
  const shown = cells.slice(-weeks * 7 + ((7 - (cells.length % 7)) % 7));
  const dateFmt = new Intl.DateTimeFormat(widget.locale, { year: "numeric", month: "short", day: "numeric" });
  grid.style.setProperty("--weeks", Math.ceil(shown.length / 7));
  grid.innerHTML = shown.map((d) => d
    ? `<i class="l${d[1]}" title="${fmt(W.day, { date: dateFmt.format(new Date(d[0] + "T12:00")), n: d[2] })}"></i>`
    : `<i class="pad"></i>`).join("");
}

(async () => {
  data = await widget.storage.get("data");
  render();
  refresh();
})();
setInterval(refresh, 3 * 3600e3);
new ResizeObserver(() => render()).observe($("grid"));
widget.settings.onChange((all) => {
  const was = opts.user;
  opts = all;
  if (was !== all.user) { render(); refresh(); }
});
