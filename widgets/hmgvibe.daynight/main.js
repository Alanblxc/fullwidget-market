// 日夜世界地图: the night side of the Earth on a world map, from the sun's position worked out
// from the date and time alone (no network), with twilight in three steps, and a few cities.
const $ = (id) => document.getElementById(id);
const rad = Math.PI / 180, deg = 180 / Math.PI;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

// name (any language) → [time zone, latitude, longitude]
const CITIES = [
  [["北京", "Beijing"], "Asia/Shanghai", 39.9, 116.4], [["上海", "Shanghai"], "Asia/Shanghai", 31.2, 121.5],
  [["香港", "Hong Kong"], "Asia/Hong_Kong", 22.3, 114.2], [["台北", "Taipei"], "Asia/Taipei", 25.0, 121.6],
  [["東京", "东京", "Tokyo"], "Asia/Tokyo", 35.7, 139.7], [["首爾", "首尔", "Seoul"], "Asia/Seoul", 37.6, 127.0],
  [["新加坡", "Singapore"], "Asia/Singapore", 1.35, 103.8], [["曼谷", "Bangkok"], "Asia/Bangkok", 13.8, 100.5],
  [["雅加達", "雅加达", "Jakarta"], "Asia/Jakarta", -6.2, 106.8], [["新德里", "New Delhi", "Delhi"], "Asia/Kolkata", 28.6, 77.2],
  [["杜拜", "迪拜", "Dubai"], "Asia/Dubai", 25.2, 55.3], [["莫斯科", "Moscow"], "Europe/Moscow", 55.8, 37.6],
  [["伊斯坦堡", "伊斯坦布尔", "Istanbul"], "Europe/Istanbul", 41.0, 29.0], [["開羅", "开罗", "Cairo"], "Africa/Cairo", 30.0, 31.2],
  [["約翰尼斯堡", "约翰内斯堡", "Johannesburg"], "Africa/Johannesburg", -26.2, 28.0], [["倫敦", "伦敦", "London"], "Europe/London", 51.5, -0.1],
  [["巴黎", "Paris"], "Europe/Paris", 48.9, 2.35], [["柏林", "Berlin"], "Europe/Berlin", 52.5, 13.4],
  [["羅馬", "罗马", "Rome"], "Europe/Rome", 41.9, 12.5], [["馬德里", "马德里", "Madrid"], "Europe/Madrid", 40.4, -3.7],
  [["紐約", "纽约", "New York"], "America/New_York", 40.7, -74.0], [["多倫多", "多伦多", "Toronto"], "America/Toronto", 43.7, -79.4],
  [["芝加哥", "Chicago"], "America/Chicago", 41.9, -87.6], [["洛杉磯", "洛杉矶", "Los Angeles"], "America/Los_Angeles", 34.1, -118.2],
  [["舊金山", "旧金山", "San Francisco"], "America/Los_Angeles", 37.8, -122.4], [["溫哥華", "温哥华", "Vancouver"], "America/Vancouver", 49.3, -123.1],
  [["墨西哥城", "Mexico City"], "America/Mexico_City", 19.4, -99.1], [["聖保羅", "圣保罗", "São Paulo", "Sao Paulo"], "America/Sao_Paulo", -23.6, -46.6],
  [["布宜諾斯艾利斯", "布宜诺斯艾利斯", "Buenos Aires"], "America/Argentina/Buenos_Aires", -34.6, -58.4],
  [["雪梨", "悉尼", "Sydney"], "Australia/Sydney", -33.9, 151.2], [["墨爾本", "墨尔本", "Melbourne"], "Australia/Melbourne", -37.8, 145.0],
  [["奧克蘭", "奥克兰", "Auckland"], "Pacific/Auckland", -36.8, 174.8], [["檀香山", "Honolulu"], "Pacific/Honolulu", 21.3, -157.9],
];

$("land").setAttribute("d", LAND);
let opts = widget.settings.get();

/** Where the sun is overhead now: [latitude, longitude] in degrees. */
function subsolar(date) {
  const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = (2 * Math.PI / 365) * (day - 1 + (hours - 12) / 24); // the fractional year
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  let lon = -15 * (hours - 12 + eot / 60);
  lon = ((lon + 540) % 360) - 180;
  return [decl * deg, lon];
}

/** The part of the map where the sun is lower than `alt` degrees, as a path. */
function shade(sunLat, sunLon, alt) {
  const d = sunLat * rad, sinH = Math.sin(alt * rad);
  const line = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const H = (lon - sunLon) * rad;
    const A = Math.sin(d), B = Math.cos(d) * Math.cos(H), R = Math.hypot(A, B);
    // A·sin φ + B·cos φ = sin h  →  φ = asin(sin h / R) − atan2(B, A)
    let lat = (Math.asin(Math.max(-1, Math.min(1, sinH / R))) - Math.atan2(B, A)) * deg;
    if (lat < -90) lat += 180; else if (lat > 90) lat -= 180;
    line.push([lon + 180, 90 - Math.max(-90, Math.min(90, lat))]);
  }
  // the dark side holds the pole the sun is away from
  const pole = sunLat >= 0 ? 180 : 0;
  return `M0 ${pole}` + line.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(2)}`).join("") + `L360 ${pole}Z`;
}

function altitude(sunLat, sunLon, lat, lon) {
  const d = sunLat * rad, H = (lon - sunLon) * rad, p = lat * rad;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) * deg;
}

function cities() {
  const names = String(opts.cities || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const n of names) {
    const c = CITIES.find(([alias]) => alias.some((a) => a.toLowerCase() === n.toLowerCase()));
    if (c && !out.some((o) => o.name === n)) out.push({ name: n, tz: c[1], lat: c[2], lon: c[3] });
    if (out.length === 5) break;
  }
  return out;
}

function draw() {
  const now = new Date();
  const [sLat, sLon] = subsolar(now);
  $("n1").setAttribute("d", shade(sLat, sLon, 0));
  $("n2").setAttribute("d", shade(sLat, sLon, -6));
  $("n3").setAttribute("d", shade(sLat, sLon, -12));
  $("sun").setAttribute("transform", `translate(${(sLon + 180).toFixed(1)} ${(90 - sLat).toFixed(1)})`);

  const list = cities();
  const fmt = (tz) => new Intl.DateTimeFormat(widget.locale, { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: !!opts.hour12 });
  $("pins").innerHTML = list.map((c) => `<g transform="translate(${(c.lon + 180).toFixed(1)} ${(90 - c.lat).toFixed(1)})"><circle r="3.2" class="halo"/><circle r="1.5" class="pin"/></g>`).join("");
  $("cities").innerHTML = list.map((c) => {
    const day = altitude(sLat, sLon, c.lat, c.lon) > -0.83;
    const t = fmt(c.tz).format(now);
    return `<div class="city"><span class="dot ${day ? "day" : "night"}"></span><span class="nm">${esc(c.name)}</span><span class="t w-num">${t}</span></div>`;
  }).join("");
  document.body.classList.toggle("no-cities", !list.length);
}

draw();
// once a minute, on the minute
setTimeout(() => { draw(); setInterval(draw, 60_000); }, 60_000 - (Date.now() % 60_000) + 50);
widget.settings.onChange((all) => { opts = all; draw(); });
