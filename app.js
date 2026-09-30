// 表示だけ。計算は Python 側（juggler midday）で済ませている
const ARROW = { up: "↑", flat: "→", down: "↓", none: "" };
const state = { entries: [], date: null, file: null, cmp: "all", doc: null };

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

function usualText(u) {
  if (!u) return "普段のデータなし";
  const thin = u.thin ? `（${u.days}日・日数が少ない）` : "";
  return `${u.label}の普段 ${u.value.toFixed(1)}${thin}`;
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

  const rows = document.getElementById("rows");
  rows.replaceChildren();
  if (!doc.rows.length) rows.append(el("p", "missing", "まだ数字が出ていません"));
  for (const r of doc.rows) {
    const u = state.cmp === "all" ? r.usual_all : r.usual_same;
    const row = el("div", r.few ? "row few" : "row");
    row.append(el("span", "rank", String(r.rank)));
    row.append(el("span", "name", `${r.shop_name} ${r.machine_label}`));
    const v = el("span", "value " + (r.arrow === "up" ? "up" : r.arrow === "down" ? "down" : ""),
      `${r.value.toFixed(1)} ${ARROW[r.arrow]}`);
    row.append(v);
    const diff = u ? `（${r.value - u.value >= 0 ? "+" : ""}${(r.value - u.value).toFixed(1)}）` : "";
    const units = r.installed ? `${r.installed}台中${r.active}台稼働` : `${r.active}台稼働`;
    row.append(el("span", "sub", `${usualText(u)}${diff}　${units}${r.few ? "　まだ少ない" : ""}`));
    rows.append(row);
  }
  document.getElementById("missing").textContent =
    doc.missing.map((n) => `※ ${n}は今回取得できませんでした`).join("　");
}

async function load(file) {
  state.file = file;
  state.date = state.entries.find((e) => e.file === file).date;
  state.doc = await getJson(`data/${file}`);
  render();
}

async function main() {
  for (const b of document.querySelectorAll("#compare button")) {
    b.onclick = () => { state.cmp = b.dataset.cmp; render(); };
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
