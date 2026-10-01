// 表示だけ。計算は Python 側（juggler midday）で済ませている
const ARROW = { up: "↑", flat: "→", down: "↓", none: "" };
// Python 側の MIDDAY_ARROW_THRESHOLD と同じ。REG の矢印はここで決める（JSON には合算の矢印しか無い）
const ARROW_THRESHOLD = 0.3;
const METRIC_LABEL = { comb: "合算", reg: "REG" };
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
  const rows = document.getElementById("rows");
  rows.replaceChildren();
  if (!doc.rows.length) rows.append(el("p", "missing", "まだ数字が出ていません"));
  sorted.forEach(({ r, v }, i) => {
    const u = state.cmp === "all" ? r.usual_all : r.usual_same;
    const base = pick(u, metric);
    const arrow = arrowOf(v, pick(r.usual_all, metric));
    const row = el("div", r.few ? "row few" : "row");
    row.append(el("span", "rank", String(i + 1)));
    row.append(el("span", "name", `${r.shop_name} ${r.machine_label}`));
    row.append(el("span", "value " + (arrow === "up" ? "up" : arrow === "down" ? "down" : ""),
      v == null ? `${METRIC_LABEL[metric]} -` : `${METRIC_LABEL[metric]} ${v.toFixed(1)} ${ARROW[arrow]}`));
    const diff = v != null && base != null ? `（${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}）` : "";
    const units = r.installed ? `${r.installed}台中${r.active}台稼働` : `${r.active}台稼働`;
    const ov = pick(r, other);
    const otherText = ov == null ? "" : `${METRIC_LABEL[other]} ${ov.toFixed(1)}　`;
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
