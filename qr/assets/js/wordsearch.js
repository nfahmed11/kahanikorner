// word-search.js (type="module")

// ✅ Use vocab.js (NOT riddles)
import { vocab as originalVocab } from "./vocab.js";

/* ===================== Allowed Words (from HTML) ===================== */
// Your HTML must define this BEFORE this module runs:
// window.ALLOWED_WORDS = new Set(["peela","laal", ...])
const ALLOWED_WORDS = window.ALLOWED_WORDS;

if (!(ALLOWED_WORDS instanceof Set)) {
  console.error(
    "[word-search] window.ALLOWED_WORDS is missing or not a Set. " +
      "Define it in a <script> BEFORE this module script."
  );
}

/* ===================== Build WORDS from vocab.js ===================== */
const WORDS = (Array.isArray(originalVocab) ? originalVocab : [])
  .filter((item) => item?.word?.english && item?.word?.romanUrdu)
  .map((item) => ({
    en: String(item.word.english).trim(),
    ru: String(item.word.romanUrdu).trim(),
  }))
  // ✅ Only keep words that are explicitly allowed by your HTML Set (match by romanUrdu)
  .filter((w) => {
    if (!(ALLOWED_WORDS instanceof Set)) return true; // fail-open if missing
    const key = w.ru.toLowerCase();
    return ALLOWED_WORDS.has(key);
  });

/* ===================== Config ===================== */
// Direction vectors
const DIRS = {
  H: { dx: 1, dy: 0 },
  V: { dx: 0, dy: 1 },
  DR: { dx: 1, dy: 1 },
  DL: { dx: -1, dy: 1 },
};

// ✅ Single-slider difficulty: 6 levels (no backwards ever)
const DIFFICULTY = [
  { label: "Level 1", rows: 8, cols: 8, dirs: ["H"], density: 0.3 },
  { label: "Level 2", rows: 9, cols: 9, dirs: ["H", "V"], density: 0.45 },
  {
    label: "Level 3",
    rows: 10,
    cols: 10,
    dirs: ["H", "V", "DR"],
    density: 0.6,
  },
  {
    label: "Level 4",
    rows: 11,
    cols: 11,
    dirs: ["H", "V", "DR", "DL"],
    density: 0.75,
  },
  {
    label: "Level 5",
    rows: 12,
    cols: 12,
    dirs: ["H", "V", "DR", "DL"],
    density: 0.9,
  },
  {
    label: "Level 6",
    rows: 13,
    cols: 13,
    dirs: ["H", "V", "DR", "DL"],
    density: 1.0,
  },
];

// UI uses #levelRange + #levelLabel (we repurpose it as Difficulty)
const LEVEL_KEYS = DIFFICULTY.map((_, i) => String(i)); // ["0","1",...]
const MAX_ATTEMPTS = 2500;
const PALETTE = ["#9B5DE5", "#F15BB5", "#FEE440", "#00BBF9", "#00F5D4"];
const MAX_CELL_PX = 34; // cap cell px
const letters = "abcdefghijklmnopqrstuvwxyz";

/* ===================== State ===================== */
let state = {
  rows: 10,
  cols: 10,
  grid: [],
  wordsPlaced: [],
  selection: [],
  isDragging: false,
  startCell: null,
  found: new Set(),

  // Timer is ALWAYS optional and never forced by difficulty
  timerOn: true,
  t0: 0,
  tId: null,
  userTimerOverridden: false,

  clueSide: "en",

  // ✅ single slider index (0..5)
  difficultyIdx: 0,

  // derived from difficulty
  allowedDirs: DIFFICULTY[0].dirs.slice(),
};

/* ===================== Utils ===================== */
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const rand = (n) => Math.floor(Math.random() * n);
const choice = (arr) => arr[rand(arr.length)];
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

function updateRangeFill(el) {
  const min = +el.min,
    max = +el.max,
    val = +el.value;
  el.style.setProperty("--p", ((val - min) / (max - min)) * 100 + "%");
}

function getAllowedDirs() {
  return state.allowedDirs.map((k) => DIRS[k]);
}

/* ===================== Slider (single) ===================== */
const levelRange = document.getElementById("levelRange"); // repurposed: Difficulty
const levelLabel = document.getElementById("levelLabel");

// If density slider exists in HTML, hide it so UI becomes single-slider
const densityRange = document.getElementById("densityRange");
const densityLabel = document.getElementById("densityLabel");
if (densityRange)
  densityRange.closest(".slider-group")?.setAttribute("hidden", "true");

function syncDifficultyUI() {
  if (!levelRange || !levelLabel) return;

  // Re-label so it reads correctly
  levelRange.min = "0";
  levelRange.max = String(DIFFICULTY.length - 1);
  levelRange.step = "1";

  levelRange.value = String(state.difficultyIdx);
  levelLabel.textContent = DIFFICULTY[state.difficultyIdx].label;

  updateRangeFill(levelRange);

  // Optional: adjust aria label so screen readers reflect new meaning
  levelRange.setAttribute("aria-label", "Difficulty (Level 1 → Level 6)");
}

function selectDifficulty(idx) {
  state.difficultyIdx = Math.max(0, Math.min(DIFFICULTY.length - 1, idx));

  const D = DIFFICULTY[state.difficultyIdx];
  state.rows = D.rows;
  state.cols = D.cols;
  state.allowedDirs = D.dirs.slice();

  syncDifficultyUI();
  buildPuzzle();
}

if (levelRange) {
  levelRange.addEventListener("input", (e) => {
    updateRangeFill(e.target);
    const idx = +e.target.value;
    if (levelLabel) levelLabel.textContent = DIFFICULTY[idx]?.label ?? "Level";
    selectDifficulty(idx);
  });
}

/* ===================== Timer ===================== */
function startTimer() {
  state.t0 = Date.now();
  stopTimer();
  const timeEl = qs("#time");
  if (!state.timerOn) {
    if (timeEl) timeEl.textContent = "0:00";
    return;
  }
  state.tId = setInterval(() => {
    const sec = Math.floor((Date.now() - state.t0) / 1000);
    const t = qs("#time");
    if (t) t.textContent = fmtTime(sec);
  }, 500);
}
function stopTimer() {
  if (state.tId) {
    clearInterval(state.tId);
    state.tId = null;
  }
}
function addPenalty(seconds = 10) {
  state.t0 -= seconds * 1000;
}

/* ===================== Placement helpers ===================== */
function inBoundsSize(r, c, rows, cols) {
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

function canPlaceSize(grid, word, r, c, dir, rows, cols, allowOverlap = true) {
  for (let i = 0; i < word.length; i++) {
    const rr = r + dir.dy * i,
      cc = c + dir.dx * i;
    if (!inBoundsSize(rr, cc, rows, cols)) return false;
    const cell = grid[rr][cc];
    if (cell) {
      if (!allowOverlap) return false;
      if (cell !== word[i]) return false;
    }
  }
  return true;
}

function placeWordSize(grid, word, r, c, dir) {
  const cells = [];
  for (let i = 0; i < word.length; i++) {
    const rr = r + dir.dy * i,
      cc = c + dir.dx * i;
    grid[rr][cc] = word[i];
    cells.push({ r: rr, c: cc });
  }
  return cells;
}

function layoutWordsForSize(rawPairs, rows, cols, allowOverlap, dirs) {
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  const placed = [];
  const pairs = [...rawPairs].sort(
    (a, b) => norm(b.target).length - norm(a.target).length
  );

  for (const p of pairs) {
    const target = norm(p.target);
    if (!target || target.length < 2) continue;

    let ok = false;

    for (let attempts = 0; attempts < MAX_ATTEMPTS && !ok; attempts++) {
      const dir = choice(dirs);
      const r = rand(rows),
        c = rand(cols);
      if (canPlaceSize(grid, target, r, c, dir, rows, cols, allowOverlap)) {
        const cells = placeWordSize(grid, target, r, c, dir);
        placed.push({
          id: p.id,
          text: target,
          clue: p.clue,
          color: p.color,
          cells,
        });
        ok = true;
      }
    }

    if (!ok) {
      outer: for (const dir of dirs) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (
              canPlaceSize(grid, target, r, c, dir, rows, cols, allowOverlap)
            ) {
              const cells = placeWordSize(grid, target, r, c, dir);
              placed.push({
                id: p.id,
                text: target,
                clue: p.clue,
                color: p.color,
                cells,
              });
              ok = true;
              break outer;
            }
          }
        }
      }
    }

    if (!ok) return { success: false };
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) grid[r][c] = letters[rand(letters.length)];
    }
  }

  return { success: true, grid, placed, rows, cols };
}

/* ===================== Word count from density ===================== */
/*
  User chose: "density % that converts to count" AND "only as many that will fit".
  We'll compute a capacity-based max, then take density * max.
*/
function computeWordCountForCurrentDifficulty() {
  const D = DIFFICULTY[state.difficultyIdx];
  const area = D.rows * D.cols;

  // Heuristic: grid capacity for words (keeps it “fit-able”)
  const avgLen = 6;
  const maxByArea = Math.max(6, Math.floor(area / (avgLen + 2)));

  // density is defined per difficulty level
  const N = Math.floor(maxByArea * D.density);

  // Clamp to vocab availability and at least 6
  return Math.min(WORDS.length, Math.max(6, N));
}

/* ===================== Build Puzzle ===================== */
function buildPuzzle() {
  // If nothing is allowed, fail loudly
  if (WORDS.length === 0) {
    console.error(
      "[word-search] No WORDS available after filtering by window.ALLOWED_WORDS."
    );
    alert(
      "No allowed words found. Check window.ALLOWED_WORDS and vocab.js romanUrdu values."
    );
    return;
  }

  const D = DIFFICULTY[state.difficultyIdx];
  state.rows = D.rows;
  state.cols = D.cols;
  state.allowedDirs = D.dirs.slice();

  const N = computeWordCountForCurrentDifficulty();

  const chosen = shuffle([...WORDS]).slice(0, Math.min(N, WORDS.length));

  const pairs = chosen.map((w, idx) => {
    const show = state.clueSide === "en" ? w.ru : w.en; // target in grid
    const clue = state.clueSide === "en" ? w.en : w.ru; // displayed clue
    const color = PALETTE[idx % PALETTE.length];
    return { id: idx + "_" + Date.now(), clue, target: show, color };
  });

  const dirs = getAllowedDirs();
  const tryLayout = (r, c, overlap = false) =>
    layoutWordsForSize(pairs, r, c, overlap, dirs);

  let res = tryLayout(state.rows, state.cols, false);
  if (!res.success) res = tryLayout(state.rows, state.cols, true);

  // Keep your existing grow behavior (rarely needed but safe)
  let grew = 0;
  const MAX_GROW = 8;
  while (!res.success && grew < MAX_GROW) {
    grew++;
    const newRows = state.rows + grew;
    const newCols = state.cols + grew;
    res = layoutWordsForSize(pairs, newRows, newCols, true, dirs);
    if (res.success) {
      state.rows = newRows;
      state.cols = newCols;
    }
  }

  if (!res.success) {
    console.error(
      "[word-search] Could not generate puzzle even after expanding board."
    );
    alert(
      "Too many/long words for this setup. Try a lower level (difficulty)."
    );
    return;
  }

  state.grid = res.grid;
  state.wordsPlaced = res.placed;
  state.found = new Set();

  renderGrid();
  renderClues();
  setupClueCarousel();

  const goalCount = qs("#goalCount");
  const foundCount = qs("#foundCount");
  if (goalCount) goalCount.textContent = String(state.wordsPlaced.length);
  if (foundCount) foundCount.textContent = "0";

  const legendClues = qs("#legendClues");
  const legendGrid = qs("#legendGrid");
  if (legendClues) {
    legendClues.innerHTML =
      state.clueSide === "en"
        ? '<span class="pill">Clues: English</span>'
        : '<span class="pill">Clues: Roman Urdu</span>';
  }
  if (legendGrid) {
    legendGrid.innerHTML =
      state.clueSide === "en"
        ? '<span class="pill">Find: Roman Urdu</span>'
        : '<span class="pill">Find: English</span>';
  }

  startTimer();
}

/* ===================== Render Clues ===================== */
function renderClues() {
  const ul = qs("#clues");
  if (!ul) return;
  ul.innerHTML = "";

  for (const w of state.wordsPlaced) {
    const li = document.createElement("li");
    li.className = "clue";
    li.dataset.id = w.id;
    li.style.boxShadow = `inset 6px 0 0 ${w.color}66`;

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = w.color;

    const label = document.createElement("span");
    label.textContent = w.clue;
    label.style.marginLeft = "6px";
    label.setAttribute("data-role", "label");

    const leftWrap = document.createElement("span");
    leftWrap.style.display = "inline-flex";
    leftWrap.style.alignItems = "center";
    leftWrap.append(dot, label);

    li.append(leftWrap);

    li.addEventListener("click", (ev) => {
      ev.stopPropagation();
      flashFirstCell(w.id);
    });

    ul.appendChild(li);
  }
}

/* ===================== Mobile Clue Carousel ===================== */
let autoScrollId = null;
let carouselPaused = false;
let slidesPerView = 2;

function applySlidesPerView() {
  const ul = qs("#clues");
  if (!ul) return;
  const w = ul.clientWidth;
  slidesPerView = w >= 560 ? 3 : 2;
  ul.style.setProperty("--slides", String(slidesPerView));
}

function scrollNextClue() {
  const ul = qs("#clues");
  if (!ul) return;

  const amount = Math.round((ul.clientWidth / slidesPerView) * 0.95);
  const maxScroll = ul.scrollWidth - ul.clientWidth;
  const currentScroll = ul.scrollLeft;

  if (currentScroll + amount >= maxScroll - 5) {
    ul.scrollTo({ left: 0, behavior: "smooth" });
  } else {
    ul.scrollBy({ left: amount, behavior: "smooth" });
  }
}

function startClueAuto() {
  if (window.innerWidth > 768) return;
  stopClueAuto();
  autoScrollId = setInterval(scrollNextClue, 2200);
}

function stopClueAuto() {
  if (autoScrollId) {
    clearInterval(autoScrollId);
    autoScrollId = null;
  }
}

function setCarouselPaused(p) {
  carouselPaused = p;
  if (p) stopClueAuto();
  else startClueAuto();
}

function onCluesClickToggle() {
  if (window.innerWidth > 768) return;
  setCarouselPaused(!carouselPaused);
}
function onCluesPointerDown() {
  if (window.innerWidth > 768) return;
  setCarouselPaused(true);
}
function onCluesWheel() {
  if (window.innerWidth > 768) return;
  setCarouselPaused(true);
}

function setupClueCarousel() {
  const ul = qs("#clues");
  if (!ul) return;

  applySlidesPerView();

  ul.removeEventListener("click", onCluesClickToggle);
  ul.removeEventListener("pointerdown", onCluesPointerDown);
  ul.removeEventListener("wheel", onCluesWheel);

  ul.addEventListener("click", onCluesClickToggle);
  ul.addEventListener("pointerdown", onCluesPointerDown, { passive: true });
  ul.addEventListener("wheel", onCluesWheel, { passive: true });

  if (window.innerWidth <= 768) setCarouselPaused(false);
  else setCarouselPaused(true);
}

/* ===================== Render Grid ===================== */
function renderGrid() {
  const g = qs("#grid");
  if (!g) return;
  g.innerHTML = "";

  const panel = g.closest(".panel");
  const panelStyles = getComputedStyle(panel);
  const panelInnerWidth =
    panel.clientWidth -
    parseFloat(panelStyles.paddingLeft) -
    parseFloat(panelStyles.paddingRight);

  const gs = getComputedStyle(g);
  const gap = parseFloat(gs.gap) || 4;
  const paddingX =
    (parseFloat(gs.paddingLeft) || 0) + (parseFloat(gs.paddingRight) || 0);
  const borderX = 6;

  const cellsBand =
    panelInnerWidth - paddingX - borderX - gap * (state.cols - 1);
  const cell = Math.min(
    MAX_CELL_PX,
    Math.max(24, Math.floor(cellsBand / state.cols))
  );

  g.style.gridTemplateColumns = `repeat(${state.cols}, ${cell}px)`;
  g.style.gridAutoRows = `${cell}px`;

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      d.style.width = d.style.height = `${cell}px`;
      d.style.fontSize = `${Math.max(12, Math.floor(cell * 0.52))}px`;
      d.style.lineHeight = "1";

      d.dataset.r = r;
      d.dataset.c = c;
      d.textContent = state.grid[r][c];

      d.addEventListener("pointerdown", onStart);
      d.addEventListener("pointerenter", onMove);
      d.addEventListener("pointerup", onEnd);

      g.appendChild(d);
    }
  }

  g.addEventListener(
    "pointerleave",
    () => state.isDragging && clearSelection()
  );
}

/* ===================== Interaction ===================== */
function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < state.rows && c < state.cols;
}

function cellAt(ev) {
  const el = ev.target.closest(".cell");
  if (!el) return null;
  return { el, r: +el.dataset.r, c: +el.dataset.c };
}

function onStart(ev) {
  ev.preventDefault();
  const cell = cellAt(ev);
  if (!cell) return;
  state.isDragging = true;
  state.selection = [cell];
  state.startCell = cell;

  cell.el.setPointerCapture?.(ev.pointerId);
  markSelected();
}

function onMove(ev) {
  if (!state.isDragging) return;

  const elAtPoint = document.elementFromPoint(ev.clientX, ev.clientY);
  const cellEl = elAtPoint && elAtPoint.closest(".cell");
  if (!cellEl) return;

  const cell = { el: cellEl, r: +cellEl.dataset.r, c: +cellEl.dataset.c };

  const a = state.startCell;
  const b = cell;
  const dr = b.r - a.r,
    dc = b.c - a.c;
  const adR = Math.abs(dr),
    adC = Math.abs(dc);

  if (!(adR === 0 || adC === 0 || adR === adC)) return;

  const stepR = Math.sign(dr),
    stepC = Math.sign(dc);
  const len = Math.max(adR, adC);
  const path = [];

  for (let i = 0; i <= len; i++) {
    const r = a.r + i * stepR;
    const c = a.c + i * stepC;
    if (!inBounds(r, c)) return;
    path.push({ r, c });
  }

  state.selection = path.map((p) => ({
    el: document.querySelector(`.cell[data-r="${p.r}"][data-c="${p.c}"]`),
    r: p.r,
    c: p.c,
  }));

  markSelected();
}

function onEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;
  checkSelection();
  clearSelection();
}

function onCancel() {
  if (!state.isDragging) return;
  state.isDragging = false;
  clearSelection();
}

function markSelected() {
  qsa(".cell").forEach((el) => (el.dataset.sel = "0"));
  for (const s of state.selection) s.el.dataset.sel = "1";
}

function clearSelection() {
  qsa(".cell").forEach((el) => (el.dataset.sel = "0"));
  state.selection = [];
  state.startCell = null;
}

function moveClueToEnd(wordId) {
  const li = document.querySelector(`.clue[data-id="${wordId}"]`);
  if (!li || !li.parentElement) return;

  const parent = li.parentElement;

  if (window.innerWidth <= 768) {
    parent.appendChild(li);
    return;
  }

  const allItems = [...parent.children];
  const firstRects = new Map();
  allItems.forEach((item) =>
    firstRects.set(item, item.getBoundingClientRect())
  );

  parent.appendChild(li);

  const lastRects = new Map();
  allItems.forEach((item) => lastRects.set(item, item.getBoundingClientRect()));

  allItems.forEach((item) => {
    const first = firstRects.get(item);
    const last = lastRects.get(item);
    const dx = first.left - last.left;
    const dy = first.top - last.top;

    if (dx !== 0 || dy !== 0) {
      item.style.transform = `translate(${dx}px, ${dy}px)`;
      item.style.transition = "none";
      item.offsetHeight;
      item.style.transition = "transform 0.5s ease";
      item.style.transform = "translate(0, 0)";
      item.addEventListener(
        "transitionend",
        () => {
          item.style.transform = "";
          item.style.transition = "";
        },
        { once: true }
      );
    }
  });
}

function checkSelection() {
  if (state.selection.length < 2) return;

  const lettersSel = state.selection.map((s) => state.grid[s.r][s.c]).join("");
  const hit = state.wordsPlaced.find(
    (w) => !state.found.has(w.id) && lettersSel === w.text
  );
  if (!hit) return;

  state.found.add(hit.id);

  for (const s of state.selection) {
    s.el.dataset.found = "1";
    s.el.dataset.word = "1";
    s.el.style.background = hit.color;
    s.el.style.color = "#0b0f19";
    s.el.classList.add("pop");
    setTimeout(() => s.el.classList.remove("pop"), 300);
  }

  const li = document.querySelector(`.clue[data-id="${hit.id}"]`);
  if (li) {
    li.classList.add("found");
    li.style.background = hit.color;
    li.style.borderColor = hit.color;
    li.style.color = "#0b0f19";
    setTimeout(() => moveClueToEnd(hit.id), 0);
  }

  const foundCount = qs("#foundCount");
  if (foundCount) foundCount.textContent = String(state.found.size);

  if (state.found.size === state.wordsPlaced.length) {
    stopTimer();
    const winModal = qs("#winModal");
    if (winModal) winModal.classList.add("show");
    const finalTime = qs("#finalTime");
    const finalWords = qs("#finalWords");
    const timeEl = qs("#time");
    if (finalTime && timeEl) finalTime.textContent = timeEl.textContent;
    if (finalWords) finalWords.textContent = String(state.found.size);
  }
}

function flashFirstCell(wordId) {
  const w = state.wordsPlaced.find((x) => x.id === wordId);
  if (!w) return;
  const first = w.cells[0];
  const el = document.querySelector(
    `.cell[data-r="${first.r}"][data-c="${first.c}"]`
  );
  if (el) {
    el.classList.add("hint-flash");
    setTimeout(() => el.classList.remove("hint-flash"), 1600);
  }
}

/* ===================== Toolbar Menu (mobile) ===================== */
const toolbar = qs("#toolbar");
const menuToggle = qs("#menuToggle");

function setMenu(open) {
  if (!toolbar || !menuToggle) return;
  if (open) {
    toolbar.classList.add("open");
    toolbar.classList.remove("collapsed");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.textContent = "✕";
  } else {
    toolbar.classList.remove("open");
    toolbar.classList.add("collapsed");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
  }
}

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const open = !toolbar.classList.contains("open");
    setMenu(open);
  });
}

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

function closeIfOutside(e) {
  if (!isMobile()) return;
  if (!toolbar.classList.contains("open")) return;

  const clickedInsideToolbar = toolbar.contains(e.target);
  const clickedToggle = menuToggle.contains(e.target);
  if (clickedInsideToolbar || clickedToggle) return;

  setMenu(false);
}
document.addEventListener("click", closeIfOutside);

let lastY = window.scrollY;
window.addEventListener(
  "scroll",
  () => {
    if (!isMobile()) {
      lastY = window.scrollY;
      return;
    }
    const y = window.scrollY;
    const scrolledDown = y > lastY + 10;
    lastY = y;
    if (scrolledDown && toolbar.classList.contains("open")) setMenu(false);
  },
  { passive: true }
);

/* ===================== Mobile status bar relocation ===================== */
function relocateStats() {
  const toolbar = qs("#toolbar");
  const statusBar = qs("#statusBar");
  const stats = qs(".stats");
  if (!stats || !toolbar || !statusBar) return;

  if (window.innerWidth <= 768) {
    if (!statusBar.contains(stats)) statusBar.appendChild(stats);
  } else {
    if (!toolbar.contains(stats)) toolbar.appendChild(stats);
  }
}

/* ===================== Controls ===================== */
const newGameBtn = qs("#newGame");
if (newGameBtn) {
  newGameBtn.addEventListener("click", () => {
    buildPuzzle();
    if (window.innerWidth <= 768) setMenu(false);
  });
}

const hintBtn = qs("#hintBtn");
if (hintBtn) {
  hintBtn.addEventListener("click", () => {
    addPenalty(10);
    for (const w of state.wordsPlaced)
      if (!state.found.has(w.id)) flashFirstCell(w.id);
  });
}

const toggleTimerBtn = qs("#toggleTimer");
if (toggleTimerBtn) {
  toggleTimerBtn.addEventListener("click", (e) => {
    state.userTimerOverridden = true; // ✅ keep user choice; difficulty never forces timer
    const wasOn = state.timerOn;
    state.timerOn = !state.timerOn;
    e.target.textContent = `Timer: ${state.timerOn ? "On" : "Off"}`;

    // if turning ON, rebuild to restart a clean clock (matches your current behavior)
    if (!wasOn && state.timerOn) buildPuzzle();
    else startTimer();
  });
}

const playAgainBtn = qs("#playAgain");
if (playAgainBtn)
  playAgainBtn.addEventListener(
    "click",
    () => (qs("#winModal").classList.remove("show"), buildPuzzle())
  );

const closeModalBtn = qs("#closeModal");
if (closeModalBtn)
  closeModalBtn.addEventListener("click", () =>
    qs("#winModal").classList.remove("show")
  );

/* ===================== Clue chooser popover ===================== */
const clueBtn = qs("#clueBtn");
const clueMenu = qs("#clueMenu");

function updateClueUI() {
  if (!clueMenu || !clueBtn) return;

  const modeText =
    state.clueSide === "en" ? "English → Roman Urdu" : "Roman Urdu → English";

  clueMenu.querySelectorAll('[role="menuitemradio"]').forEach((b) => {
    b.setAttribute(
      "aria-checked",
      b.dataset.side === state.clueSide ? "true" : "false"
    );
  });

  clueBtn.setAttribute("aria-label", `Clues (${modeText})`);
  clueBtn.setAttribute("title", `Clues — ${modeText}`);
}

function setClueSide(side) {
  state.clueSide = side;
  updateClueUI();
  buildPuzzle();
}

function toggleClueMenu(open) {
  if (!clueMenu || !clueBtn) return;
  if (open) {
    clueMenu.hidden = false;
    clueBtn.setAttribute("aria-expanded", "true");
    clueMenu.querySelector(`[data-side="${state.clueSide}"]`)?.focus();
  } else {
    clueMenu.hidden = true;
    clueBtn.setAttribute("aria-expanded", "false");
  }
}

if (clueBtn) {
  clueBtn.addEventListener("click", () => {
    toggleClueMenu(clueMenu.hidden);
  });
}

if (clueMenu) {
  clueMenu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-side]");
    if (!item) return;
    setClueSide(item.dataset.side);
    toggleClueMenu(false);
  });

  document.addEventListener("click", (e) => {
    if (clueMenu.hidden) return;
    if (e.target === clueBtn || clueMenu.contains(e.target)) return;
    toggleClueMenu(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleClueMenu(false);
  });
}

updateClueUI();

/* ===================== Global pointer listeners ===================== */
document.addEventListener("pointermove", onMove, { passive: true });
document.addEventListener("pointerup", onEnd);
document.addEventListener("pointercancel", onCancel);

/* ===================== Header bump on scroll ===================== */
const bumpHeader = () => {
  const h = document.querySelector("header");
  if (!h) return;
  h.classList.toggle("scrolled", window.scrollY > 2);
};
window.addEventListener("scroll", bumpHeader, { passive: true });
bumpHeader();

/* ===================== Init ===================== */
(function init() {
  if (window.innerWidth <= 768) setMenu(false);
  else if (menuToggle) {
    toolbar.classList.remove("collapsed", "open");
    menuToggle.textContent = "☰";
    menuToggle.setAttribute("aria-expanded", "false");
  }

  relocateStats();
  window.addEventListener("resize", relocateStats);

  // ✅ init difficulty slider
  syncDifficultyUI();

  // ✅ start at Level 1 by default
  selectDifficulty(0);
})();
