// B站粉丝数: an account's follower count from Bilibili's public card API (no sign-in), checked
// every ten minutes. The widget keeps one reading per day to show today's change and two weeks.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const W = {
  fans: t({ "zh-TW": "粉絲", "zh-CN": "粉丝", en: "Followers" }),
  today: t({ "zh-TW": "今天 {d}", "zh-CN": "今天 {d}", en: "{d} today" }),
  noUid: t({ "zh-TW": "在設定裏填上 B站 UID", "zh-CN": "在设置里填上 B站 UID", en: "Add the Bilibili UID in the settings" }),
  bad: t({ "zh-TW": "找不到這個 UID", "zh-CN": "找不到这个 UID", en: "No account with this UID" }),
  offline: t({ "zh-TW": "暫時連不上 B站", "zh-CN": "暂时连不上 B站", en: "Can't reach Bilibili right now" }),
  wan: t({ "zh-TW": "萬", "zh-CN": "万", en: "" }),
};
let opts = widget.settings.get();
let st = null; // { uid, name, face, fans, at, days: { "2026-11-15": first count that day }, last: { day: count } }

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const uid = () => String(opts.uid || "").trim().replace(/\D/g, "");

function big(n) {
  // 1,438,221 → 143.8万 in Chinese; the full number in English
  if (W.wan && n >= 1e5) return `${(n / 1e4).toFixed(n >= 1e7 ? 0 : 1)}<small>${W.wan}</small>`;
  return n.toLocaleString(widget.locale);
}

async function refresh() {
  const id = uid();
  if (!id) return render();
  try {
    const r = await widget.fetch(`https://api.bilibili.com/x/web-interface/card?mid=${id}`, { headers: { Referer: "https://space.bilibili.com/" } });
    const j = await r.json();
    if (j.code === -404 || j.code === -400) { st = { uid: id, bad: true }; return render(); }
    if (j.code !== 0) throw new Error(`${j.code} ${j.message}`);
    const c = j.data.card;
    const fans = +c.fans || +j.data.follower || 0;
    if (!st || st.uid !== id || st.bad) st = { uid: id, days: {}, last: {} };
    const today = iso(new Date());
    st.name = c.name;
    st.face = c.face;
    st.fans = fans;
    st.at = Date.now();
    if (st.days[today] == null) st.days[today] = fans;  // the first reading of the day: today's change counts from it
    st.last[today] = fans;                             // the latest of the day: the line through the days
    for (const m of [st.days, st.last]) for (const k of Object.keys(m).sort().slice(0, -30)) delete m[k];
    await widget.storage.set("state", st);
  } catch (e) {
    widget.log("bilibili: " + e.message);
    if (st && st.uid === id) st.offline = true;
    else st = { uid: id, offline: true };
  }
  render();
}

function render() {
  const id = uid();
  const msg = (text) => { $("msg").hidden = !text; $("msg").textContent = text || ""; document.body.classList.toggle("empty", !!text); };
  $("label").textContent = W.fans;
  if (!id) return msg(W.noUid);
  if (!st || st.uid !== id) return msg("…");
  if (st.bad) return msg(W.bad);
  if (st.fans == null) return msg(W.offline);
  msg("");
  $("name").textContent = st.name || "";
  $("face").innerHTML = st.face
    ? `<img src="${st.face.replace(/^http:/, "https:")}@96w_96h_1c.webp" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
    : `<b>${(st.name || "?").slice(0, 1).replace(/[&<>"]/g, "")}</b>`;
  $("fans").innerHTML = big(st.fans);
  $("fans").title = st.fans.toLocaleString(widget.locale);
  const today = iso(new Date());
  const d = st.fans - (st.days[today] ?? st.fans);
  $("delta").textContent = W.today.replace("{d}", d > 0 ? `+${d.toLocaleString(widget.locale)}` : d < 0 ? `−${(-d).toLocaleString(widget.locale)}` : "±0");
  $("delta").className = `delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`;

  // the last 14 days' closing counts
  const keys = Object.keys(st.last).sort().slice(-14);
  const vals = keys.map((k) => st.last[k]);
  if (vals.length < 2) { $("line").setAttribute("d", ""); $("area").setAttribute("d", ""); return; }
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 100, 36 - ((v - min) / span) * 30]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  $("line").setAttribute("d", line);
  $("area").setAttribute("d", `${line}L100 40L0 40Z`);
}

(async () => {
  st = await widget.storage.get("state");
  render();
  refresh();
})();
setInterval(refresh, 10 * 60e3);
widget.settings.onChange((all) => {
  const was = uid();
  opts = all;
  if (uid() !== was) { render(); refresh(); }
});
