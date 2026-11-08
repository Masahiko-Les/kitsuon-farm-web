import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot,
  writeBatch, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/test_farm01/firebase-config.js";

/* =========================================================
   設定
   ========================================================= */
const MAP_ID = "farm01";
const MAX_WATERERS = 5;
const MAX_LINES = 10;
const MAX_CHARS = 300;
const NAME_MAX = 12;
const TILE = 16;

// T=木 .=草 ,=畑 P=道 ~=池 F=柵 H=家 M=郵便受け
const MAP = [
  "TTTTTTTTTTTTTTTT",
  "T..HH....,,,,,.T",
  "T..HHM...,,,,,.T",
  "T..PP....,,,,,.T",
  "T..PPPPPPPPP...T",
  "T.~~.....P.....T",
  "T.~~..,,,P,,,..T",
  "T.....,,,P,,,..T",
  "T.FFF.,,,P,,,..T",
  "T.....PPPP.....T",
  "T......P......TT",
  "TTTTTTTPTTTTTTTT",
];
const COLS = MAP[0].length;
const ROWS = MAP.length;
const WALKABLE = new Set([".", ",", "P"]);
const SOWABLE = new Set([".", ","]);

const CROPS = [
  { id: "tomato", name: "トマト", emoji: "🍅" },
  { id: "carrot", name: "にんじん", emoji: "🥕" },
  { id: "eggplant", name: "なす", emoji: "🍆" },
  { id: "cucumber", name: "きゅうり", emoji: "🥒" },
  { id: "corn", name: "とうもろこし", emoji: "🌽" },
  { id: "potato", name: "じゃがいも", emoji: "🥔" },
  { id: "pepper", name: "ピーマン", emoji: "🫑" },
  { id: "pumpkin", name: "かぼちゃ", emoji: "🎃" },
  { id: "strawberry", name: "いちご", emoji: "🍓" },
  { id: "cabbage", name: "はくさい", emoji: "🥬" },
];
const cropById = (id) => CROPS.find((c) => c.id === id) || CROPS[0];

// 試作用の簡易フィルタ。本番ではサーバー側のチェックと組み合わせる。
const NG_WORDS = ["死ね", "しね", "殺す", "ころす", "きもい", "キモい", "キモイ", "うざい", "ウザい", "ばか", "バカ", "馬鹿", "アホ", "あほ", "クズ", "くず", "ゴミ", "消えろ", "きえろ", "障害者のくせに", "どもるな"];
const CONTACT_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.]+/, // メールアドレス
  /https?:\/\//i, // URL
  /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/, // 電話番号
  /(LINE|ライン|インスタ|instagram|twitter|ツイッター|discord|ディスコード)\s*(ID|id|アカウント|で|に)/i,
];
// 公開前に、専門家と一緒に語句を見直すこと。
const CRISIS_WORDS = ["死にたい", "しにたい", "消えたい", "きえたい", "自殺", "自死", "生きていたくない", "生きたくない", "終わりにしたい", "リスカ", "リストカット", "自傷", "首を吊", "首吊", "飛び降り", "とびおり", "遺書", "オーバードーズ"];

/* =========================================================
   Firebase
   ========================================================= */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================================================
   状態
   ========================================================= */
const state = {
  uid: null,
  name: "",
  player: { x: 8, y: 9, dir: "down", fromX: 8, fromY: 9, moveStart: 0, walking: false, frame: 0 },
  publicSeeds: new Map(),
  mySeeds: new Map(),
  letters: [],
  crops: [],
  blocked: new Set(),
  hiddenSeeds: new Set(loadLocal("tf01-hidden-seeds", [])),
  effects: [],
  ready: false,
};

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても続行 */ }
}

/* =========================================================
   DOM
   ========================================================= */
const $ = (id) => document.getElementById(id);
const canvas = $("farm");
const ctx = canvas.getContext("2d");
const modal = $("modal");
const modalBody = $("modal-body");
const hintEl = $("hint");
const aBtn = $("btn-a");

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}

function openModal(...children) {
  modalBody.replaceChildren(...children);
  if (!modal.open) modal.showModal();
  const first = modalBody.querySelector("textarea, input, .btn-primary, .btn-water");
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() {
  if (modal.open) modal.close();
  updateHint();
}
modal.addEventListener("close", updateHint);

let toastTimer = null;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

/* =========================================================
   文章チェック
   ========================================================= */
function measure(text) {
  return { lines: text === "" ? 0 : text.split("\n").length, chars: [...text].length };
}
function checkText(text) {
  const trimmed = text.trim();
  const { lines, chars } = measure(text);
  if (!trimmed) return { error: "何か書いてから送ってください。" };
  if (lines > MAX_LINES) return { error: `${MAX_LINES}行以内にしてください（いま${lines}行）。` };
  if (chars > MAX_CHARS) return { error: `${MAX_CHARS}字以内にしてください（いま${chars}字）。` };
  const crisis = CRISIS_WORDS.some((w) => text.includes(w));
  if (NG_WORDS.some((w) => text.includes(w))) {
    return { error: "相手を傷つけるおそれのある言葉が含まれています。言い換えてください。", crisis };
  }
  if (CONTACT_PATTERNS.some((p) => p.test(text))) {
    return { error: "連絡先やSNSのアカウントは書けません。消してから送ってください。", crisis };
  }
  return { ok: true, crisis };
}

function paperField(placeholder) {
  const ta = el("textarea", { class: "paper paper-input", placeholder, "aria-label": placeholder });
  const counter = el("p", { class: "counter" });
  const update = () => {
    const { lines, chars } = measure(ta.value);
    counter.textContent = `${lines} / ${MAX_LINES}行　${chars} / ${MAX_CHARS}字`;
    counter.classList.toggle("over", lines > MAX_LINES || chars > MAX_CHARS);
  };
  ta.addEventListener("input", update);
  update();
  return { ta, counter };
}

/* =========================================================
   マップの判定
   ========================================================= */
const tileAt = (x, y) => (MAP[y] && MAP[y][x]) || "T";
const keyOf = (x, y) => `${x}_${y}`;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function seedAt(x, y) {
  const k = keyOf(x, y);
  if (state.mySeeds.has(k)) return state.mySeeds.get(k);
  if (state.hiddenSeeds.has(k)) return null;
  return state.publicSeeds.get(k) || null;
}
function seedKind(seed) {
  if (!seed) return null;
  if (seed.ownerUid === state.uid) return seed.status === "review" ? "mine-review" : "mine";
  if ((seed.waterers || []).includes(state.uid)) return "watered";
  if ((seed.waterCount || 0) >= MAX_WATERERS) return "full";
  return "open";
}
function facingTile() {
  const [dx, dy] = DIRS[state.player.dir];
  return { x: state.player.x + dx, y: state.player.y + dy };
}
function nearOpenSeed() {
  const { x, y } = state.player;
  for (const s of state.publicSeeds.values()) {
    if (seedKind(s) !== "open" || state.hiddenSeeds.has(s.id)) continue;
    if (Math.abs(s.x - x) + Math.abs(s.y - y) <= 2) return true;
  }
  return false;
}

/* =========================================================
   ヒントとAボタン
   ========================================================= */
function currentAction() {
  if (!state.ready) return { label: "…", hint: "読み込み中…", run: null };
  const f = facingTile();
  if (tileAt(f.x, f.y) === "M") {
    return { label: "開く", hint: "郵便受けだ。Aで開く。", run: showMailbox };
  }
  const { x, y } = state.player;
  const seed = seedAt(x, y);
  const kind = seedKind(seed);
  if (kind === "mine" || kind === "mine-review") {
    return { label: "見る", hint: "あなたが蒔いた種だ。", run: () => showOwnSeed(seed) };
  }
  if (kind === "open") {
    return { label: "調べる", hint: "土の中に種が埋まっている！", run: () => showSeed(seed) };
  }
  if (kind === "watered") {
    return { label: "見る", hint: "あなたが水やりした種だ。", run: () => toast("この種にはもう水やりしました。") };
  }
  if (kind === "full") {
    return { label: "見る", hint: "5人に水やりされて、すっかり育った。", run: () => toast("この種は5人に水やりされ、育ちきりました。") };
  }
  const tile = tileAt(x, y);
  if (SOWABLE.has(tile)) {
    const near = nearOpenSeed() ? "近くに種の気配がする…　" : "";
    return { label: "蒔く", hint: `${near}ここに種を蒔ける。`, run: showSow };
  }
  return { label: "…", hint: nearOpenSeed() ? "近くに種の気配がする…" : "道の上には種を蒔けない。", run: null };
}

function updateHint() {
  const a = currentAction();
  hintEl.textContent = a.hint;
  aBtn.textContent = a.label;
  aBtn.disabled = !a.run;
}

function pressA() {
  if (modal.open) return;
  const a = currentAction();
  if (a.run) a.run();
}

/* =========================================================
   移動
   ========================================================= */
const MOVE_MS = 150;

function tryMove(dir) {
  if (modal.open || !state.ready) return;
  const p = state.player;
  if (p.walking) return;
  p.dir = dir;
  const [dx, dy] = DIRS[dir];
  const nx = p.x + dx;
  const ny = p.y + dy;
  if (!WALKABLE.has(tileAt(nx, ny))) { updateHint(); return; }
  p.fromX = p.x; p.fromY = p.y;
  p.x = nx; p.y = ny;
  p.walking = true;
  p.moveStart = performance.now();
  p.frame = (p.frame + 1) % 2;
  setTimeout(() => { p.walking = false; updateHint(); }, MOVE_MS);
}

const KEY_DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
window.addEventListener("keydown", (e) => {
  if (modal.open) return;
  const dir = KEY_DIRS[e.key];
  if (dir) { e.preventDefault(); tryMove(dir); return; }
  if (e.key === " " || e.key === "Enter") {
    if (document.activeElement && document.activeElement.tagName === "BUTTON" && document.activeElement !== aBtn) return;
    e.preventDefault();
    pressA();
  }
});

document.querySelectorAll(".pad").forEach((btn) => {
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    tryMove(btn.dataset.dir);
    stop();
    timer = setInterval(() => tryMove(btn.dataset.dir), MOVE_MS + 20);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener("click", (e) => { if (e.detail === 0) tryMove(btn.dataset.dir); }); // キーボード操作
});
aBtn.addEventListener("click", pressA);
$("btn-mail").addEventListener("click", showMailbox);
$("btn-book").addEventListener("click", showBook);
$("btn-help").addEventListener("click", showHelp);

/* =========================================================
   描画
   ========================================================= */
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

function drawGrass(X, Y, tx, ty) {
  rect(X, Y, 16, 16, "#8dbf5a");
  const h = hash(tx, ty);
  for (let i = 0; i < 4; i++) {
    const gx = (h >> (i * 4)) % 14 + 1;
    const gy = (h >> (i * 4 + 2)) % 13 + 1;
    rect(X + gx, Y + gy, 1, 2, "#6fa347");
  }
}
function drawSoil(X, Y) {
  rect(X, Y, 16, 16, "#8a5a34");
  for (const r of [3, 7, 11, 15]) rect(X, Y + r, 16, 1, "#6f4526");
  rect(X + 3, Y + 1, 2, 1, "#a06c42");
  rect(X + 10, Y + 9, 2, 1, "#a06c42");
}
function drawPath(X, Y, tx, ty) {
  rect(X, Y, 16, 16, "#d8c28e");
  const h = hash(tx, ty);
  rect(X + (h % 12) + 2, Y + ((h >> 3) % 12) + 2, 2, 1, "#bfa674");
  rect(X + ((h >> 6) % 12) + 2, Y + ((h >> 9) % 12) + 2, 1, 1, "#bfa674");
}
function drawWater(X, Y, tx, t) {
  rect(X, Y, 16, 16, "#5fa8c8");
  const o = Math.floor(t / 280 + tx * 3) % 12;
  rect(X + o, Y + 4, 4, 1, "#9ed3e6");
  rect(X + ((o + 6) % 12), Y + 10, 3, 1, "#9ed3e6");
}
function drawTree(X, Y, tx, ty) {
  drawGrass(X, Y, tx, ty);
  rect(X + 7, Y + 11, 2, 4, "#6b4a2e");
  rect(X + 2, Y + 1, 12, 10, "#3e7a3a");
  rect(X + 1, Y + 3, 14, 6, "#3e7a3a");
  rect(X + 4, Y + 3, 4, 2, "#5e9e4e");
  rect(X + 9, Y + 6, 2, 2, "#5e9e4e");
}
function drawFence(X, Y, tx, ty) {
  drawGrass(X, Y, tx, ty);
  rect(X, Y + 7, 16, 2, "#a9845a");
  rect(X, Y + 11, 16, 1, "#a9845a");
  rect(X + 2, Y + 5, 2, 9, "#7a5a3a");
  rect(X + 12, Y + 5, 2, 9, "#7a5a3a");
}
function drawMailbox(X, Y, tx, ty, hasUnread) {
  drawGrass(X, Y, tx, ty);
  rect(X + 7, Y + 8, 2, 8, "#6b4a2e");
  rect(X + 4, Y + 3, 8, 6, "#c4473a");
  rect(X + 4, Y + 3, 8, 1, "#e06a5c");
  if (hasUnread) { rect(X + 12, Y + 1, 2, 5, "#7a5a3a"); rect(X + 12, Y + 1, 3, 2, "#f2d04b"); }
}
function drawHouse() {
  const X = 3 * TILE, Y = 1 * TILE;
  rect(X + 2, Y + 12, 28, 20, "#ead9b5");
  rect(X, Y, 32, 13, "#b5523b");
  for (let i = 0; i < 4; i++) rect(X, Y + 3 * i + 1, 32, 1, "#93402d");
  rect(X + 12, Y + 20, 8, 12, "#7a5235");
  rect(X + 18, Y + 26, 1, 1, "#f2d04b");
  rect(X + 4, Y + 16, 6, 6, "#7fb6d6");
  rect(X + 22, Y + 16, 6, 6, "#7fb6d6");
}

function drawMound(X, Y, color = "#6b4226") {
  rect(X + 5, Y + 11, 6, 2, color);
  rect(X + 6, Y + 10, 4, 1, color);
}
function drawSprout(X, Y, size, pale) {
  drawMound(X, Y);
  const stem = pale ? "#6f9a5a" : "#4f8f3a";
  const leaf = pale ? "#a8c98f" : "#7cc35a";
  const h = 3 + size;
  rect(X + 7, Y + 10 - h, 2, h, stem);
  rect(X + 4, Y + 10 - h, 3, 2, leaf);
  rect(X + 9, Y + 9 - h, 3, 2, leaf);
}
function drawSparkle(X, Y, t, tx) {
  drawMound(X, Y);
  if ((Math.floor(t / 380) + tx) % 2 === 0) {
    rect(X + 8, Y + 4, 1, 4, "#fff6c2");
    rect(X + 6, Y + 5, 5, 1, "#fff6c2");
  } else {
    rect(X + 7, Y + 6, 2, 2, "#fff6c2");
  }
}
function drawFullPlant(X, Y) {
  drawMound(X, Y);
  rect(X + 7, Y + 3, 2, 8, "#4f8f3a");
  rect(X + 3, Y + 5, 4, 2, "#7cc35a");
  rect(X + 9, Y + 4, 4, 2, "#7cc35a");
  rect(X + 5, Y + 1, 6, 3, "#e8a33c");
}

function drawPlayer(t) {
  const p = state.player;
  let fx = p.x, fy = p.y;
  if (p.walking) {
    const k = Math.min(1, (t - p.moveStart) / MOVE_MS);
    fx = p.fromX + (p.x - p.fromX) * k;
    fy = p.fromY + (p.y - p.fromY) * k;
  }
  const X = Math.round(fx * TILE), Y = Math.round(fy * TILE);
  rect(X + 3, Y + 14, 10, 2, "rgba(0,0,0,0.18)");
  // 足
  const step = p.walking ? (p.frame ? 1 : -1) : 0;
  rect(X + 5, Y + 12 + Math.max(0, step), 2, 3 - Math.max(0, step), "#5a3e2b");
  rect(X + 9, Y + 12 + Math.max(0, -step), 2, 3 - Math.max(0, -step), "#5a3e2b");
  // 服
  rect(X + 4, Y + 8, 8, 5, "#3f6fb0");
  rect(X + 4, Y + 8, 8, 1, "#5a8ccc");
  // 顔
  rect(X + 4, Y + 4, 8, 5, "#f2c9a0");
  if (p.dir === "up") rect(X + 4, Y + 4, 8, 3, "#5a3e2b");
  if (p.dir === "down") { rect(X + 6, Y + 6, 1, 1, "#2f2a24"); rect(X + 9, Y + 6, 1, 1, "#2f2a24"); }
  if (p.dir === "left") rect(X + 5, Y + 6, 1, 1, "#2f2a24");
  if (p.dir === "right") rect(X + 10, Y + 6, 1, 1, "#2f2a24");
  // 麦わら帽子
  rect(X + 4, Y + 1, 8, 3, "#e2c25b");
  rect(X + 2, Y + 3, 12, 1, "#c9a640");
}

function drawEffects(t) {
  state.effects = state.effects.filter((e) => t - e.start < e.duration);
  for (const e of state.effects) {
    const X = e.x * TILE, Y = e.y * TILE;
    const k = (t - e.start) / e.duration;
    if (e.type === "water") {
      for (let i = 0; i < 5; i++) {
        const dy = ((t - e.start) / 6 + i * 7) % 18;
        rect(X + 2 + i * 3, Y - 4 + dy, 1, 2, "#9ed3e6");
      }
      rect(X + 3, Y + 13, 10 * Math.min(1, k * 2), 1, "#5fa8c8");
    }
    if (e.type === "sow") {
      const r = Math.floor(k * 6);
      rect(X + 8 - r, Y + 8, 1, 1, "#fff6c2");
      rect(X + 8 + r, Y + 8, 1, 1, "#fff6c2");
      rect(X + 8, Y + 8 - r, 1, 1, "#fff6c2");
    }
  }
}

function render(t) {
  const hasUnread = visibleLetters().some((l) => l.status === "unread");
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const X = x * TILE, Y = y * TILE;
      const c = tileAt(x, y);
      if (c === "." || c === "H") drawGrass(X, Y, x, y);
      else if (c === ",") drawSoil(X, Y);
      else if (c === "P") drawPath(X, Y, x, y);
      else if (c === "~") drawWater(X, Y, x, t);
      else if (c === "T") drawTree(X, Y, x, y);
      else if (c === "F") drawFence(X, Y, x, y);
      else if (c === "M") drawMailbox(X, Y, x, y, hasUnread);
    }
  }
  drawHouse();

  const { x: px, y: py } = state.player;
  const drawn = new Set();
  const drawSeed = (s) => {
    if (drawn.has(s.id)) return;
    drawn.add(s.id);
    const X = s.x * TILE, Y = s.y * TILE;
    const kind = seedKind(s);
    if (kind === "mine") drawSprout(X, Y, Math.min(5, s.waterCount || 0), false);
    else if (kind === "mine-review") drawMound(X, Y, "#7d7666");
    else if (kind === "watered") drawSprout(X, Y, 1, true);
    else if (kind === "full") drawFullPlant(X, Y);
    else if (kind === "open" && Math.abs(s.x - px) + Math.abs(s.y - py) <= 2) drawSparkle(X, Y, t, s.x);
  };
  for (const s of state.mySeeds.values()) drawSeed(s);
  for (const s of state.publicSeeds.values()) if (!state.hiddenSeeds.has(s.id)) drawSeed(s);

  drawEffects(t);
  drawPlayer(t);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

/* =========================================================
   種を蒔く
   ========================================================= */
function showSow() {
  const { x, y } = state.player;
  const { ta, counter } = paperField("吃音の苦労を、10行以内で書いてみよう");
  const err = el("p", { class: "error", role: "alert" });
  const submit = el("button", { class: "btn btn-primary", type: "button" }, "種を蒔く");
  submit.addEventListener("click", async () => {
    const res = checkText(ta.value);
    if (res.error) { err.textContent = res.error; return; }
    submit.disabled = true;
    err.textContent = "";
    try {
      await sowSeed(x, y, ta.value.trim(), res.crisis ? "review" : "public");
      if (res.crisis) {
        showSupport("seed");
      } else {
        closeModal();
        state.effects.push({ type: "sow", x, y, start: performance.now(), duration: 700 });
        toast("種を蒔きました。誰かが見つけて、水やりしてくれるのを待とう。");
      }
    } catch (e) {
      submit.disabled = false;
      err.textContent = e.code === "permission-denied"
        ? "この場所にはすでに種が埋まっています。別の場所で蒔いてください。"
        : "種を蒔けませんでした。通信を確認して、もう一度押してください。";
      console.error(e);
    }
  });
  openModal(
    el("h2", { class: "m-title" }, "種を蒔く"),
    el("p", { class: "m-text" }, "書いた苦労は、この場所に種として埋まります。見つけた人だけが読めます。"),
    ta, counter, err,
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-quiet", type: "button", onclick: closeModal }, "やめる"),
      submit),
  );
}

async function sowSeed(x, y, text, status) {
  const id = keyOf(x, y);
  const batch = writeBatch(db);
  batch.set(doc(db, "seeds", id), {
    ownerUid: state.uid,
    ownerName: state.name,
    mapId: MAP_ID,
    x, y,
    status,
    waterCount: 0,
    waterers: [],
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "seedBodies", id), { ownerUid: state.uid, text });
  await batch.commit();
}

async function readSeedText(id) {
  const snap = await getDoc(doc(db, "seedBodies", id));
  return snap.exists() ? snap.data().text : "";
}

function showOwnSeed(seed) {
  const body = el("p", { class: "paper-text" }, "読み込み中…");
  const status = seed.status === "review"
    ? "この種は確認中のため、ほかの村人には見えていません。"
    : `${seed.waterCount || 0}人が水やりしてくれました（最大${MAX_WATERERS}人）。`;
  openModal(
    el("h2", { class: "m-title" }, "あなたが蒔いた種"),
    el("div", { class: "paper" }, body),
    el("p", { class: "m-small" }, status),
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "とじる")),
  );
  readSeedText(seed.id).then((t) => { body.textContent = t; }).catch(() => { body.textContent = "読み込めませんでした。"; });
}

/* =========================================================
   種を見つけて水やり
   ========================================================= */
async function showSeed(seed) {
  let text = "";
  try { text = await readSeedText(seed.id); } catch (e) { console.error(e); }
  if (!text) { toast("この種は読めませんでした。"); return; }
  openModal(
    el("h2", { class: "m-title" }, `${seed.ownerName}さんの種`),
    el("div", { class: "paper" }, el("p", { class: "paper-text" }, text)),
    el("p", { class: "m-text", style: "margin-top:14px" }, "水やりしますか？"),
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-quiet", type: "button", onclick: closeModal }, "いいえ"),
      el("button", { class: "btn btn-water", type: "button", onclick: () => showWaterLetter(seed, text) }, "はい")),
    el("div", { class: "m-links" },
      el("button", { class: "link-btn", type: "button", onclick: () => reportSeed(seed) }, "この種を通報する")),
  );
}

function showWaterLetter(seed, seedText) {
  const { ta, counter } = paperField(`${seed.ownerName}さんへ`);
  const err = el("p", { class: "error", role: "alert" });
  const submit = el("button", { class: "btn btn-water", type: "button" }, "水やりする");
  submit.addEventListener("click", async () => {
    const res = checkText(ta.value);
    if (res.crisis) { showSupport("letter", () => showWaterLetter(seed, seedText)); return; }
    if (res.error) { err.textContent = res.error; return; }
    submit.disabled = true;
    err.textContent = "";
    try {
      await waterSeed(seed, seedText, ta.value.trim());
      closeModal();
      state.effects.push({ type: "water", x: seed.x, y: seed.y, start: performance.now(), duration: 1400 });
      toast(`水やりしました。手紙は${seed.ownerName}さんに届きました。`);
    } catch (e) {
      submit.disabled = false;
      const messages = {
        full: `この種にはすでに${MAX_WATERERS}人が水やりしました。`,
        already: "この種にはもう水やりしました。",
        gone: "この種は見つからなくなりました。",
      };
      err.textContent = messages[e.message] || "手紙を送れませんでした。通信を確認して、もう一度押してください。";
      console.error(e);
    }
  });
  openModal(
    el("h2", { class: "m-title" }, "優しい言葉で水やりしましょう"),
    el("details", { class: "seed-quote" },
      el("summary", {}, `${seed.ownerName}さんの種をもう一度読む`),
      el("div", { class: "paper" }, el("p", { class: "paper-text" }, seedText))),
    el("ul", { class: "tips" },
      el("li", {}, "アドバイスより、まず気持ちを受け止める言葉を"),
      el("li", {}, "似た経験があれば、ひとこと添えて")),
    ta, counter, err,
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-quiet", type: "button", onclick: () => showSeed(seed) }, "もどる"),
      submit),
  );
}

async function waterSeed(seed, seedText, text) {
  const seedRef = doc(db, "seeds", seed.id);
  const letterRef = doc(db, "letters", `${seed.id}_${state.uid}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(seedRef);
    if (!snap.exists() || snap.data().status !== "public") throw new Error("gone");
    const data = snap.data();
    const waterers = data.waterers || [];
    if (waterers.includes(state.uid)) throw new Error("already");
    if ((data.waterCount || 0) >= MAX_WATERERS) throw new Error("full");
    tx.update(seedRef, { waterCount: (data.waterCount || 0) + 1, waterers: [...waterers, state.uid] });
    tx.set(letterRef, {
      seedId: seed.id,
      toUid: data.ownerUid,
      toName: data.ownerName,
      fromUid: state.uid,
      fromName: state.name,
      seedText,
      text,
      status: "unread",
      createdAt: serverTimestamp(),
    });
  });
}

/* =========================================================
   郵便受けと手紙
   ========================================================= */
function visibleLetters() {
  return state.letters
    .filter((l) => l.status !== "reported" && !state.blocked.has(l.fromUid))
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}
const millis = (ts) => (ts && ts.toMillis ? ts.toMillis() : Date.now());
const dateText = (ts) => {
  const d = ts && ts.toDate ? ts.toDate() : new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

function updateBadge() {
  const n = visibleLetters().filter((l) => l.status === "unread").length;
  const b = $("mail-badge");
  b.hidden = n === 0;
  b.textContent = String(n);
}

function showMailbox() {
  const letters = visibleLetters();
  const content = letters.length === 0
    ? el("p", { class: "m-text" }, "まだ手紙は届いていません。種を蒔くと、見つけた村人が水やりの手紙をくれます。")
    : el("ul", { class: "list" }, letters.map((l) => {
        const crop = l.status === "thanked" ? cropForLetter(l.id) : null;
        const icon = crop ? crop.emoji : l.status === "unread" ? "✉️" : "📄";
        return el("li", {},
          el("button", { class: `list-item${l.status === "unread" ? " unread" : ""}`, type: "button", onclick: () => showLetter(l) },
            el("span", { class: "list-icon", "aria-hidden": "true" }, icon),
            el("span", { class: "list-main" },
              el("span", { class: "list-name" }, `${l.fromName}さんから`),
              el("span", { class: "list-sub" }, `${dateText(l.createdAt)}　${l.text.replace(/\n/g, " ")}`))));
      }));
  openModal(
    el("h2", { class: "m-title" }, "郵便受け"),
    content,
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "とじる")),
  );
}

function cropForLetter(letterId) {
  const c = state.crops.find((x) => x.letterId === letterId);
  return c ? cropById(c.cropType) : null;
}

async function showLetter(letter) {
  if (letter.status === "unread") {
    try {
      const b = writeBatch(db);
      b.update(doc(db, "letters", letter.id), { status: "read" });
      await b.commit();
    } catch (e) { console.error(e); }
  }
  const thanked = letter.status === "thanked";
  const crop = thanked ? cropForLetter(letter.id) : null;
  const thanksBtn = el("button", { class: "btn btn-primary", type: "button" }, "ありがとう");
  thanksBtn.addEventListener("click", async () => {
    thanksBtn.disabled = true;
    try {
      const cropType = CROPS[Math.floor(Math.random() * CROPS.length)].id;
      await sayThanks(letter, cropType);
      showHarvest(letter, cropById(cropType));
    } catch (e) {
      thanksBtn.disabled = false;
      toast("送れませんでした。もう一度押してください。");
      console.error(e);
    }
  });
  openModal(
    el("div", { class: "letter-open" },
      el("div", { class: "envelope", "aria-hidden": "true" }, "💌"),
      el("h2", { class: "m-title" }, `${letter.fromName}さんからの手紙`),
      el("details", { class: "seed-quote" },
        el("summary", {}, "あなたが蒔いた種"),
        el("div", { class: "paper" }, el("p", { class: "paper-text" }, letter.seedText || ""))),
      el("div", { class: "paper" },
        el("p", { class: "paper-text" }, letter.text),
        el("span", { class: "paper-from" }, `${letter.fromName}より`)),
      thanked
        ? el("p", { class: "m-text", style: "margin-top:14px" }, `ありがとうを伝えました。${crop ? crop.name : "作物"}が実り、${letter.fromName}さんにも届きました。`)
        : el("p", { class: "m-small" }, "「ありがとう」を押すと作物が実り、手紙をくれた人にも同じ作物が届きます。"),
      el("div", { class: "m-actions" },
        el("button", { class: "btn btn-quiet", type: "button", onclick: showMailbox }, "郵便受けにもどる"),
        thanked ? null : thanksBtn),
      el("div", { class: "m-links" },
        el("button", { class: "link-btn", type: "button", onclick: () => reportLetter(letter) }, "この手紙を通報する"),
        el("button", { class: "link-btn", type: "button", onclick: () => blockSender(letter) }, "この人をブロックする"))),
  );
}

async function sayThanks(letter, cropType) {
  const b = writeBatch(db);
  b.update(doc(db, "letters", letter.id), { status: "thanked" });
  b.set(doc(db, "crops", letter.id), {
    letterId: letter.id,
    seedId: letter.seedId,
    cropType,
    ownerUids: [state.uid, letter.fromUid],
    sowerUid: state.uid,
    sowerName: state.name,
    watererUid: letter.fromUid,
    watererName: letter.fromName,
    seedText: letter.seedText || "",
    letterText: letter.text,
    harvestedAt: serverTimestamp(),
  });
  await b.commit();
}

function showHarvest(letter, crop) {
  openModal(
    el("div", { class: "harvest" },
      el("div", { class: "crop-big", "aria-hidden": "true" }, crop.emoji),
      el("h2", { class: "m-title" }, `${crop.name}が実りました`),
      el("p", { class: "m-text" }, `${letter.fromName}さんにも、同じ${crop.name}が届きました。`),
      el("div", { class: "m-actions", style: "justify-content:center" },
        el("button", { class: "btn btn-quiet", type: "button", onclick: closeModal }, "とじる"),
        el("button", { class: "btn btn-primary", type: "button", onclick: showBook }, "思い出帳を見る"))),
  );
}

/* =========================================================
   思い出帳
   ========================================================= */
function showBook() {
  const crops = [...state.crops].sort((a, b) => millis(b.harvestedAt) - millis(a.harvestedAt));
  const got = new Set(crops.map((c) => c.cropType));
  const dex = el("div", { class: "dex" },
    `図鑑 ${got.size} / ${CROPS.length}種類`,
    el("div", { class: "dex-row", "aria-hidden": "true" },
      CROPS.map((c) => el("span", { class: got.has(c.id) ? "" : "missing" }, c.emoji))));
  const content = crops.length === 0
    ? el("p", { class: "m-text" }, "まだ作物はありません。種に水やりするか、届いた手紙に「ありがとう」を伝えると、作物が実ってここに入ります。")
    : el("div", { class: "book-grid" }, crops.map((c) => {
        const info = cropById(c.cropType);
        return el("button", { class: "book-cell", type: "button", "aria-label": `${info.name}の思い出`, onclick: () => showMemory(c) }, info.emoji);
      }));
  openModal(
    el("h2", { class: "m-title" }, "思い出帳"),
    dex,
    content,
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "とじる")),
  );
}

function showMemory(c) {
  const info = cropById(c.cropType);
  const mine = c.sowerUid === state.uid;
  const lead = mine
    ? `あなたの種に、${c.watererName}さんが水やりしてくれました。`
    : `あなたが${c.sowerName}さんの種に水やりしました。`;
  openModal(
    el("div", { class: "harvest" },
      el("div", { class: "crop-big", "aria-hidden": "true" }, info.emoji),
      el("h2", { class: "m-title" }, `${info.name}　${dateText(c.harvestedAt)}`)),
    el("p", { class: "m-text" }, lead),
    el("p", { class: "section-label" }, `${c.sowerName}さんの種`),
    el("div", { class: "paper" }, el("p", { class: "paper-text" }, c.seedText)),
    el("p", { class: "section-label" }, `${c.watererName}さんの手紙`),
    el("div", { class: "paper" }, el("p", { class: "paper-text" }, c.letterText)),
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-quiet", type: "button", onclick: showBook }, "思い出帳にもどる")),
  );
}

/* =========================================================
   通報・ブロック・相談窓口
   ========================================================= */
async function addReport(targetType, targetId) {
  const b = writeBatch(db);
  b.set(doc(collection(db, "reports")), {
    targetType, targetId, reporterUid: state.uid, createdAt: serverTimestamp(),
  });
  return b;
}

async function reportSeed(seed) {
  if (!confirm("この種を通報しますか？　あなたの画面からは見えなくなり、運営が確認します。")) return;
  try {
    const b = await addReport("seed", seed.id);
    await b.commit();
  } catch (e) { console.error(e); }
  state.hiddenSeeds.add(seed.id);
  saveLocal("tf01-hidden-seeds", [...state.hiddenSeeds]);
  closeModal();
  toast("通報しました。運営が確認します。");
}

async function reportLetter(letter) {
  if (!confirm("この手紙を通報しますか？　郵便受けから消え、運営が確認します。")) return;
  try {
    const b = await addReport("letter", letter.id);
    b.update(doc(db, "letters", letter.id), { status: "reported" });
    await b.commit();
    closeModal();
    toast("通報しました。運営が確認します。");
  } catch (e) {
    toast("通報できませんでした。もう一度試してください。");
    console.error(e);
  }
}

async function blockSender(letter) {
  if (!confirm(`${letter.fromName}さんをブロックしますか？　この人からの手紙は届かなくなります。`)) return;
  try {
    await setDoc(doc(db, "users", state.uid, "blocks", letter.fromUid), { createdAt: serverTimestamp() });
    closeModal();
    toast(`${letter.fromName}さんをブロックしました。`);
  } catch (e) {
    toast("ブロックできませんでした。もう一度試してください。");
    console.error(e);
  }
}

// 番号と受付時間は公開前に各窓口の公式サイトで確認すること。
function showSupport(kind, onBack) {
  const lead = kind === "seed"
    ? "とてもつらい気持ちが書かれていたので、この種はいったん非公開にして、運営が確認します。"
    : "とてもつらい気持ちが書かれていたので、この手紙は送らずにいったん止めました。";
  openModal(
    el("h2", { class: "m-title" }, "ひとりで抱えこまないで"),
    el("p", { class: "m-text" }, lead),
    el("p", { class: "m-text" }, "苦しいときは、話を聞いてくれる窓口があります。"),
    el("ul", { class: "support" },
      el("li", {}, "いのちの電話　", el("a", { href: "tel:0570783556" }, "0570-783-556")),
      el("li", {}, "よりそいホットライン（24時間）　", el("a", { href: "tel:0120279338" }, "0120-279-338")),
      el("li", {}, "こころの健康相談統一ダイヤル　", el("a", { href: "tel:0570064556" }, "0570-064-556"))),
    el("p", { class: "m-small" }, "受付時間は窓口によって違います。命の危険が迫っているときは119番に電話してください。"),
    el("div", { class: "m-actions" },
      onBack ? el("button", { class: "btn btn-quiet", type: "button", onclick: onBack }, "書き直す") : null,
      el("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "とじる")),
  );
}

function showHelp() {
  openModal(
    el("h2", { class: "m-title" }, "あそびかた"),
    el("ul", { class: "tips" },
      el("li", {}, "好きな場所に立って「蒔く」を押すと、吃音の苦労を種として埋められます。"),
      el("li", {}, "歩いていると、近くの土がきらっと光ります。そこに誰かの種が埋まっています。"),
      el("li", {}, "種を見つけたら、優しい言葉の手紙で水やりしましょう。1つの種に5人まで。"),
      el("li", {}, "届いた手紙に「ありがとう」を押すと作物が実り、2人の思い出帳に入ります。"),
      el("li", {}, "本名や連絡先は書かないでください。嫌な言葉は通報・ブロックできます。")),
    el("p", { class: "m-small" }, "これは試作版です。データは予告なく消えることがあります。"),
    el("div", { class: "m-actions" },
      el("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "とじる")),
  );
}

/* =========================================================
   村人名の登録
   ========================================================= */
function askName() {
  return new Promise((resolve) => {
    const input = el("input", { class: "name-input", type: "text", maxlength: String(NAME_MAX), placeholder: "例：のはらのタヌキ", "aria-label": "村人名" });
    const err = el("p", { class: "error", role: "alert" });
    const go = el("button", { class: "btn btn-primary", type: "button" }, "はじめる");
    const submit = async () => {
      const name = input.value.trim();
      if (!name) { err.textContent = "村人名を入れてください。"; return; }
      if ([...name].length > NAME_MAX) { err.textContent = `${NAME_MAX}字以内にしてください。`; return; }
      const res = checkText(name);
      if (res.error) { err.textContent = "その名前は使えません。別の名前にしてください。"; return; }
      go.disabled = true;
      try {
        await setDoc(doc(db, "users", state.uid), { villagerName: name, createdAt: serverTimestamp() });
        closeModal();
        resolve(name);
      } catch (e) {
        go.disabled = false;
        err.textContent = "登録できませんでした。通信を確認して、もう一度押してください。";
        console.error(e);
      }
    };
    go.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) submit(); });
    modal.addEventListener("cancel", (e) => { if (!state.name) e.preventDefault(); });
    openModal(
      el("h2", { class: "m-title" }, "ようこそ、試作農園へ"),
      el("p", { class: "m-text" }, "この農園での呼び名を決めてください。ほかの村人にはこの名前だけが見えます。本名やSNSの名前は使わないでください。"),
      input, err,
      el("div", { class: "m-actions" }, go),
    );
  });
}

/* =========================================================
   起動
   ========================================================= */
function subscribe() {
  onSnapshot(query(collection(db, "seeds"), where("status", "==", "public")), (snap) => {
    state.publicSeeds = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    updateHint();
  }, (e) => console.error("seeds", e));

  onSnapshot(query(collection(db, "seeds"), where("ownerUid", "==", state.uid)), (snap) => {
    state.mySeeds = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    updateHint();
  }, (e) => console.error("mySeeds", e));

  let lettersReady = false;
  onSnapshot(query(collection(db, "letters"), where("toUid", "==", state.uid)), (snap) => {
    if (lettersReady) {
      snap.docChanges().forEach((ch) => {
        if (ch.type === "added" && !state.blocked.has(ch.doc.data().fromUid)) toast("郵便受けに手紙が届きました。");
      });
    }
    lettersReady = true;
    state.letters = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateBadge();
  }, (e) => console.error("letters", e));

  let cropsReady = false;
  onSnapshot(query(collection(db, "crops"), where("ownerUids", "array-contains", state.uid)), (snap) => {
    if (cropsReady) {
      snap.docChanges().forEach((ch) => {
        const c = ch.doc.data();
        if (ch.type === "added" && c.watererUid === state.uid) {
          toast(`${c.sowerName}さんから「ありがとう」。あなたの言葉で${cropById(c.cropType).name}が実りました。`);
        }
      });
    }
    cropsReady = true;
    state.crops = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, (e) => console.error("crops", e));

  onSnapshot(collection(db, "users", state.uid, "blocks"), (snap) => {
    state.blocked = new Set(snap.docs.map((d) => d.id));
    updateBadge();
  }, (e) => console.error("blocks", e));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try { await signInAnonymously(auth); } catch (e) {
      hintEl.textContent = "ログインできませんでした。Firebaseの設定（匿名認証）を確認してください。";
      console.error(e);
    }
    return;
  }
  if (state.uid === user.uid) return;
  state.uid = user.uid;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    state.name = snap.exists() ? snap.data().villagerName : await askName();
  } catch (e) {
    hintEl.textContent = "読み込めませんでした。Firebaseの設定を確認してください。";
    console.error(e);
    return;
  }
  $("villager-name").textContent = `${state.name}さん`;
  state.ready = true;
  subscribe();
  updateHint();
});
