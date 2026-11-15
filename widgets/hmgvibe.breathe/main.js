// 呼吸练习: a circle that grows as you breathe in, waits while you hold, shrinks as you breathe
// out. Each phase is one CSS transition (no per-frame work), and nothing moves while it's idle.
const $ = (id) => document.getElementById(id);
const t = widget.t;
const W = {
  start: t({ "zh-TW": "點一下開始", "zh-CN": "点一下开始", en: "Tap to start" }),
  in: t({ "zh-TW": "吸氣", "zh-CN": "吸气", en: "Breathe in" }),
  hold: t({ "zh-TW": "屏息", "zh-CN": "屏息", en: "Hold" }),
  out: t({ "zh-TW": "呼氣", "zh-CN": "呼气", en: "Breathe out" }),
  stop: t({ "zh-TW": "點一下停止", "zh-CN": "点一下停止", en: "Tap to stop" }),
  done: t({ "zh-TW": "做得好", "zh-CN": "做得好", en: "Well done" }),
  doneHint: t({ "zh-TW": "想再來一次就點一下", "zh-CN": "想再来一次就点一下", en: "Tap to go again" }),
  idleHint: t({ "zh-TW": "跟著圓圈慢慢呼吸 {m} 分鐘", "zh-CN": "跟着圆圈慢慢呼吸 {m} 分钟", en: "Breathe with the circle for {m} min" }),
  today: t({ "zh-TW": "今天 {n} 次", "zh-CN": "今天 {n} 次", en: "{n} today" }),
};
const PATTERNS = {
  calm: { name: t({ "zh-TW": "平靜呼吸", "zh-CN": "平静呼吸", en: "Calm breathing" }), steps: [["in", 4], ["out", 6]] },
  box: { name: t({ "zh-TW": "方形呼吸", "zh-CN": "方形呼吸", en: "Box breathing" }), steps: [["in", 4], ["hold", 4], ["out", 4], ["hold", 4]] },
  478: { name: t({ "zh-TW": "4-7-8 呼吸", "zh-CN": "4-7-8 呼吸", en: "4-7-8 breathing" }), steps: [["in", 4], ["hold", 7], ["out", 8]] },
};
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
let opts = widget.settings.get();
let run = null; // { started, end, timer, tick }
let count = { day: "", n: 0 };

const pattern = () => PATTERNS[opts.pattern] || PATTERNS.calm;
const minutes = () => +opts.minutes || 2;
const todayKey = () => new Date().toDateString();

function idle(finished) {
  const orb = $("orb");
  orb.style.transitionDuration = "1.2s";
  orb.style.setProperty("--s", finished ? "0.62" : "0.5");
  document.body.classList.remove("running");
  document.body.classList.toggle("finished", !!finished);
  $("phase").textContent = finished ? W.done : W.start;
  $("sec").textContent = "";
  $("hint").textContent = finished ? W.doneHint : fmt(W.idleHint, { m: minutes() });
  $("done").style.strokeDashoffset = finished ? "0" : "100";
  header();
}

function header() {
  $("pattern").textContent = pattern().name;
  $("today").textContent = count.day === todayKey() && count.n ? fmt(W.today, { n: count.n }) : "";
}

function start() {
  const steps = pattern().steps;
  const total = minutes() * 60e3;
  run = { started: Date.now(), end: Date.now() + total, i: -1, timer: 0, tick: 0 };
  document.body.classList.add("running");
  $("hint").textContent = W.stop;
  const next = () => {
    if (!run) return;
    // stop at the end of a breath out, once the time is up
    if (Date.now() >= run.end && (run.i < 0 || steps[run.i][0] !== "in")) return finish();
    run.i = (run.i + 1) % steps.length;
    const [kind, secs] = steps[run.i];
    const orb = $("orb");
    orb.style.transitionDuration = `${secs}s`;
    if (kind === "in") orb.style.setProperty("--s", "1");
    else if (kind === "out") orb.style.setProperty("--s", "0.5");
    orb.dataset.kind = kind;
    $("phase").textContent = W[kind];
    let left = secs;
    $("sec").textContent = left;
    clearInterval(run.tick);
    run.tick = setInterval(() => { left -= 1; if (left > 0) $("sec").textContent = left; }, 1000);
    run.timer = setTimeout(next, secs * 1000);
    $("done").style.strokeDashoffset = String(Math.max(0, 100 - ((Date.now() - run.started) / total) * 100));
  };
  next();
}

function stop() {
  if (!run) return;
  clearTimeout(run.timer);
  clearInterval(run.tick);
  run = null;
}

async function finish() {
  stop();
  if (count.day !== todayKey()) count = { day: todayKey(), n: 0 };
  count.n += 1;
  await widget.storage.set("count", count);
  idle(true);
}

$("stage").addEventListener("click", () => {
  if (run) { stop(); idle(false); } else start();
});

(async () => {
  count = (await widget.storage.get("count")) || count;
  idle(false);
})();
widget.settings.onChange((all) => { opts = all; if (!run) idle(false); else header(); });
