// 期待収支シミュレーター。機械割と1ゲームあたりの期待差枚は Python 側（juggler midday）で出してあり、
// ここでは「× ゲーム数」と円への換算だけをする。設計書 juggler-analyzer-paste/docs/superpowers/specs/2026-10-13-expected-profit-simulator-design.md
const GAMES_PER_HOUR = 750; // アキラさんの実践の値（2026-10-13）
const YEN_PER_COIN = 20; // 等価
const MIN_VALUE = 3.5; // 17時の答え合わせで 3.5以上は閉店後も3以上が 77〜90%
// 12時の速報は答え合わせで順位がほとんど当たらなかったので、15時・17時だけ出す
const SIM_FROM_HOUR = 15;
// つまみは10分刻み。端だけは 9:00 開店〜22:45 閉店の通し打ち（13時間45分）にそろえる
const STEP_MIN = 10, MAX_MIN = 13 * 60 + 45;
const LAST_STEP = Math.ceil(MAX_MIN / STEP_MIN);
// 19時から閉店までの約3時間半を、つまみを動かさずに見られるように（2026-10-16 アキラさん）
const DEFAULT_STEP = 21; // 3時間30分
const WEEKDAY = "日月火水木金土";

const state = { entries: [], doc: null, style: null, step: DEFAULT_STEP };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function getJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path);
  return res.json();
}

const hourOf = (slot) => Number(slot.slice(0, 2));
const minutesOf = (step) => Math.min(step * STEP_MIN, MAX_MIN);

function timeText(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}時間${String(m).padStart(2, "0")}分` : `${m}分`;
}

function entryText(e) {
  const [y, m, d] = e.date.split("-").map(Number);
  const wd = WEEKDAY[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}（${wd}）${hourOf(e.slot)}時の速報`;
}

function signed(n) {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("ja-JP")}`;
}

function renderControls() {
  const doc = state.doc;
  const box = document.getElementById("styles");
  box.replaceChildren();
  for (const s of doc.sim_styles) {
    const b = el("button", s.key === state.style ? "on" : "", s.label);
    b.onclick = () => { state.style = s.key; renderControls(); renderRows(); };
    box.append(b);
  }
  const min = minutesOf(state.step);
  document.getElementById("time-text").textContent = timeText(min);
  document.getElementById("games-text").textContent =
    `${Math.round((min / 60) * GAMES_PER_HOUR).toLocaleString("ja-JP")}G`;
}

function renderRows() {
  const doc = state.doc;
  const rows = document.getElementById("rows");
  rows.replaceChildren();
  // 判定も画面と同じ小数第1位で（「3.5」と出ているのに外れるズレを防ぐ）
  // 機種で割数が違うので、推定値の順と期待収支の順は一致しない。期待収支の高い順に並べる
  const perGame = (r) => r.sim.styles[state.style]?.per_game ?? -Infinity;
  const hits = doc.rows.filter((r) => r.sim && Number(r.value.toFixed(1)) >= MIN_VALUE)
    .sort((a, b) => perGame(b) - perGame(a));
  renderNotes(hits);
  if (!hits.length) {
    rows.append(el("p", "empty", `この回は推定値 ${MIN_VALUE} 以上の機種がありません`));
    return;
  }
  const games = (minutesOf(state.step) / 60) * GAMES_PER_HOUR;
  for (const r of hits) {
    const s = r.sim.styles[state.style];
    const row = el("div", "sim");
    row.append(el("span", "name", `${r.shop_name} ${r.machine_label}`));
    if (!s) {
      row.append(el("span", "yen", "-"));
      row.append(el("span", "sub", "この打ち方の割数は未登録です"));
      rows.append(row);
      continue;
    }
    const coins = Math.round(games * s.per_game);
    const yen = coins * YEN_PER_COIN;
    row.append(el("span", `yen ${yen > 0 ? "plus" : yen < 0 ? "minus" : ""}`, `${signed(yen)}円`));
    // 機械割は計算に使った値そのまま（小数第2位）。丸めて出すと手で検算したときに合わない（2026-10-13 アキラさん）
    row.append(el("span", "sub",
      `推定 ${r.value.toFixed(1)}・機械割 ${s.rate.toFixed(2)}%・差枚 ${signed(coins)}枚`));
    if (r.games != null) {
      row.append(el("span", "sub", `この時点の総回転 ${r.games.toLocaleString("ja-JP")}G・${r.installed ? `${r.installed}台中` : ""}${r.active}台稼働`));
    }
    rows.append(row);
  }
}

// 注記（マイジャグⅥの流用など）は、いま並んでいる機種の分だけ出す
function renderNotes(shown) {
  const notes = new Set(shown.filter((r) => r.sim.note).map((r) => r.sim.note));
  document.getElementById("notes").textContent = [...notes].join("　");
}

async function load(file) {
  const entry = state.entries.find((e) => e.file === file);
  let doc;
  try {
    doc = await getJson(`data/${file}`);
  } catch {
    document.getElementById("when").textContent = "読み込めませんでした";
    return;
  }
  state.doc = doc;
  document.getElementById("when").textContent = `${entryText(entry)}（${doc.time} 時点）`;
  const controls = document.getElementById("controls");
  if (!doc.sim_styles) {
    // 2026-10-13 より前の回の JSON には割数の数字が入っていない
    controls.hidden = true;
    document.getElementById("rows").replaceChildren(el("p", "empty", "この回はシミュレーターを付ける前のデータです"));
    renderNotes([]);
    return;
  }
  if (!doc.sim_styles.some((s) => s.key === state.style)) state.style = doc.sim_styles[0].key;
  controls.hidden = false;
  renderControls();
  renderRows();
}

// つまみが1目盛り（10分）動くたびに短いクリック音を鳴らす（2026-10-13 アキラさん）。
// iPhone は人が触った瞬間にしか音を出させないので、最初に触ったときに音の準備をする。消音スイッチがオンだと鳴らない
const CLICK_HZ = 1800, CLICK_SEC = 0.03, CLICK_GAIN = 0.15, SILENT = 0.0001;
const SOUND_KEY = "pekajag-sim-sound";
let audio = null;
try { state.sound = localStorage.getItem(SOUND_KEY) !== "off"; } catch { state.sound = true; }

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { audio = null; }
}

function click() {
  if (!state.sound) return;
  unlockAudio();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = CLICK_HZ;
  gain.gain.setValueAtTime(SILENT, t);
  gain.gain.exponentialRampToValueAtTime(CLICK_GAIN, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(SILENT, t + CLICK_SEC);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + CLICK_SEC + 0.01);
}

function renderSound() {
  document.getElementById("sound").textContent = state.sound ? "音あり" : "音なし";
}

async function main() {
  document.getElementById("sound").onclick = () => {
    state.sound = !state.sound;
    try { localStorage.setItem(SOUND_KEY, state.sound ? "on" : "off"); } catch { /* 覚えられなくても動く */ }
    renderSound();
    if (state.sound) click();
  };
  renderSound();
  const slider = document.getElementById("time");
  slider.max = String(LAST_STEP);
  slider.value = String(state.step);
  for (const ev of ["pointerdown", "touchstart", "touchend"]) slider.addEventListener(ev, unlockAudio, { passive: true });
  slider.oninput = () => {
    const step = Number(slider.value);
    if (step === state.step) return;
    state.step = step;
    // 付ける前の回（sim_styles が無い）を出しているあいだは、数字を描き直さない
    if (!state.doc || !state.doc.sim_styles) return;
    click();
    renderControls();
    renderRows();
  };

  let all;
  try {
    all = (await getJson("data/index.json")).entries;
  } catch {
    document.getElementById("when").textContent = "まだデータがありません";
    return;
  }
  state.entries = all.filter((e) => hourOf(e.slot) >= SIM_FROM_HOUR);
  if (!state.entries.length) {
    document.getElementById("when").textContent = "17時の速報から出ます";
    return;
  }
  const select = document.getElementById("entry");
  for (const e of state.entries) {
    const o = el("option", null, entryText(e));
    o.value = e.file;
    select.append(o);
  }
  select.onchange = () => load(select.value);
  // 今日がまだ12時の回だけなら、いちばん新しい15時・17時の回を出したうえで、そう伝える
  if (all.length && hourOf(all[0].slot) < SIM_FROM_HOUR) {
    document.getElementById("rows").before(el("p", "empty", "今日の速報はまだ12時の回だけです。17時の速報から出ます"));
  }
  await load(state.entries[0].file);
}

main();
