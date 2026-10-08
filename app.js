// 表示だけ。計算は Python 側（juggler midday）で済ませている
const ARROW = { up: "↑", flat: "→", down: "↓", none: "" };
// Python 側の MIDDAY_ARROW_THRESHOLD と同じ。REG の矢印はここで決める（JSON には合算の矢印しか無い）
const ARROW_THRESHOLD = 0.3;
const METRIC_LABEL = { comb: "合算", reg: "REG" };
// Python 側の ALERT_ADVISORY_MIN / ALERT_WARNING_MIN と同じ。alert を持たない古い回の JSON だけここで判定する
const ALERT_ADVISORY_MIN = 4.0, ALERT_WARNING_MIN = 5.0;
const ALERT_INFO = {
  warning: { title: "🚨 ペカジャグ出玉警報 🚨", cond: "合算・REG とも設定5以上" },
  advisory: { title: "⚠️ ペカジャグ出玉注意報", cond: "合算・REG とも設定4以上" },
};

function alertOf(r) {
  if ("alert" in r) return r.alert;
  if (r.value == null || r.reg == null) return null;
  const low = Math.min(Number(r.value.toFixed(1)), Number(r.reg.toFixed(1)));
  return low >= ALERT_WARNING_MIN ? "warning" : low >= ALERT_ADVISORY_MIN ? "advisory" : null;
}

// 目盛りの絵は観測所（juggler-public-site の scaleSvg）と同じ寸法・同じ描き方にそろえる
const X0 = 16, X1 = 284, W = 300, AXIS_Y = 15, SCALE_H = 30, DOT_R = 5;
// 1〜6 の外は端のすぐ外に寄せる。観測所の 0.5〜6.5 のままだと 6.4 を超えた点が絵の枠から
// はみ出して消えた（営業中は 7〜10 がよく出る。2026-10-08）
const EDGE_MIN = 0.95, EDGE_MAX = 6.05;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const xOf = (p) => X0 + ((clamp(p, EDGE_MIN, EDGE_MAX) - 1) / 5) * (X1 - X0);

function scaleSvg(pos, base) {
  let s = `<svg viewBox="0 0 ${W} ${SCALE_H}" class="scale" aria-hidden="true">`;
  s += `<line x1="${X0}" y1="${AXIS_Y}" x2="${X1}" y2="${AXIS_Y}" class="axis"/>`;
  for (let i = 1; i <= 6; i++) {
    s += `<line x1="${xOf(i)}" y1="10" x2="${xOf(i)}" y2="20" class="tick"/>`;
    s += `<text x="${xOf(i)}" y="${SCALE_H - 1}" class="tl">${i}</text>`;
  }
  if (base != null) s += `<path d="M${xOf(base) - 4} 1 l8 0 l-4 7 z" class="cmp"/>`;
  if (pos == null) {
    s += `<text x="${W / 2}" y="18" class="none">回数が足りません</text>`;
  } else {
    const out = pos < 1 || pos > 6 ? " out" : "";
    s += `<circle cx="${xOf(pos)}" cy="${AXIS_Y}" r="${DOT_R}" class="dot${out}"/>`;
  }
  return s + "</svg>";
}

function gaugeLine(label, pos, base) {
  const line = el("div", "gauge");
  line.append(el("span", "lbl", label));
  const box = el("span", "svgbox");
  box.innerHTML = scaleSvg(pos, base);
  line.append(box);
  line.append(el("span", "val", pos == null ? "-" : pos.toFixed(1)));
  return line;
}

function renderAlerts(rows) {
  const box = document.getElementById("alerts");
  box.replaceChildren();
  for (const level of ["warning", "advisory"]) {
    const hit = rows.filter((r) => alertOf(r) === level);
    if (!hit.length) continue;
    const sec = el("div", `alert ${level}`);
    sec.append(el("h2", null, ALERT_INFO[level].title));
    sec.append(el("p", "cond", ALERT_INFO[level].cond));
    const ul = el("ul");
    for (const r of hit) {
      const li = el("li");
      li.append(el("b", null, `${r.shop_name} ${r.machine_label}`));
      li.append(el("span", null, `合算 ${r.value.toFixed(1)}　REG ${r.reg.toFixed(1)}${r.few ? "　※まだ少ない" : ""}`));
      ul.append(li);
    }
    sec.append(ul);
    box.append(sec);
  }
}
const state = { entries: [], date: null, file: null, cmp: "all", metric: "comb", doc: null };

// 古い回の JSON には REG が無いので null になる
function pick(obj, metric) {
  if (!obj) return null;
  const v = metric === "reg" ? obj.reg : obj.value;
  return v == null ? null : v;
}

function arrowOf(v, base) {
  if (v == null || base == null) return "none";
  const diff = v - base;
  if (Math.abs(diff) < ARROW_THRESHOLD) return "flat";
  return diff > 0 ? "up" : "down";
}

async function getJson(path) {
  // スマホが古いデータを使い続けないように（観測所と同じ対策）
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path);
  return res.json();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function usualText(u, metric) {
  const base = pick(u, metric);
  if (base == null) return "普段のデータなし";
  const thin = u.thin ? `（${u.days}日・日数が少ない）` : "";
  return `${u.label}の普段 ${base.toFixed(1)}${thin}`;
}

function render() {
  const doc = state.doc;
  const [, m, d] = doc.date.split("-");
  document.getElementById("when").textContent =
    `${Number(m)}/${Number(d)}（${doc.weekday}）${doc.time} 時点`;

  const slots = document.getElementById("slots");
  slots.replaceChildren();
  for (const e of state.entries.filter((x) => x.date === state.date).reverse()) {
    const b = el("button", e.file === state.file ? "on" : "", `${Number(e.slot.slice(0, 2))}時`);
    b.onclick = () => load(e.file);
    slots.append(b);
  }
  for (const b of document.querySelectorAll("#compare button")) {
    b.classList.toggle("on", b.dataset.cmp === state.cmp);
  }
  for (const b of document.querySelectorAll("#metric button")) {
    b.classList.toggle("on", b.dataset.metric === state.metric);
  }

  const metric = state.metric;
  const other = metric === "reg" ? "comb" : "reg";
  // 選んだほうの値で並べ直す。値の無い行（古い回の REG）は下へ
  const sorted = doc.rows
    .map((r) => ({ r, v: pick(r, metric) }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  // もう一方の数字で並べたときの順位。合算で1位の組が REG では何位か、を一緒に見られるように
  const otherRank = new Map(doc.rows
    .map((r) => ({ r, v: pick(r, other) }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v)
    .map((x, i) => [x.r, i + 1]));
  renderAlerts(doc.rows);
  const rows = document.getElementById("rows");
  rows.replaceChildren();
  if (!doc.rows.length) rows.append(el("p", "missing", "まだ数字が出ていません"));
  sorted.forEach(({ r, v }, i) => {
    const u = state.cmp === "all" ? r.usual_all : r.usual_same;
    const base = pick(u, metric);
    const arrow = arrowOf(v, pick(r.usual_all, metric));
    const level = alertOf(r);
    const row = el("div", ["row", r.few ? "few" : "", level ? `al-${level}` : ""].filter(Boolean).join(" "));
    row.append(el("span", "rank", String(i + 1)));
    row.append(el("span", "name", `${r.shop_name} ${r.machine_label}`));
    row.append(el("span", "value " + (arrow === "up" ? "up" : arrow === "down" ? "down" : ""),
      v == null ? `${METRIC_LABEL[metric]} -` : `${METRIC_LABEL[metric]} ${v.toFixed(1)} ${ARROW[arrow]}`));
    const diff = v != null && base != null ? `（${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}）` : "";
    const units = r.installed ? `${r.installed}台中${r.active}台稼働` : `${r.active}台稼働`;
    const ov = pick(r, other);
    const otherText = ov == null ? ""
      : `${METRIC_LABEL[other]} ${ov.toFixed(1)}（${otherRank.get(r)}位）　`;
    const gauges = el("div", "gauges");
    gauges.append(gaugeLine("合算", pick(r, "comb"), pick(u, "comb")));
    gauges.append(gaugeLine("REG", pick(r, "reg"), pick(u, "reg")));
    row.append(gauges);
    row.append(el("span", "sub",
      `${otherText}${usualText(u, metric)}${diff}　${units}${r.few ? "　まだ少ない" : ""}`));
    rows.append(row);
  });
  document.getElementById("missing").textContent =
    doc.missing.map((n) => `※ ${n}は今回取得できませんでした`).join("　");
}

// 連打で古い応答が後から届いても、新しい選択を上書きしないための連番
let loadSeq = 0;

async function load(file) {
  const seq = ++loadSeq;
  const entry = state.entries.find((e) => e.file === file);
  let doc;
  try {
    doc = await getJson(`data/${file}`);
  } catch {
    // 失敗したら前の表示（state）はそのまま残す
    if (seq === loadSeq) document.getElementById("when").textContent = "読み込めませんでした";
    return;
  }
  if (seq !== loadSeq) return;
  state.file = file;
  state.date = entry.date;
  state.doc = doc;
  render();
}

async function main() {
  for (const b of document.querySelectorAll("#compare button")) {
    b.onclick = () => { state.cmp = b.dataset.cmp; render(); };
  }
  for (const b of document.querySelectorAll("#metric button")) {
    b.onclick = () => { state.metric = b.dataset.metric; if (state.doc) render(); };
  }
  try {
    state.entries = (await getJson("data/index.json")).entries;
  } catch {
    document.getElementById("when").textContent = "まだデータがありません";
    return;
  }
  if (!state.entries.length) {
    document.getElementById("when").textContent = "まだデータがありません";
    return;
  }
  await load(state.entries[0].file);
}

main();
