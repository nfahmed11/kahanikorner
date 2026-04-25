// word-search.js (type="module")
// ✅ Uses new mastervocab.js schema:
// word.baseRomanUrdu
// word.baseUrdu
// word.english
// variants[]

import { vocab as originalVocab } from "./mastervocab.js";

/* ===================== Config ===================== */
const DIRS = {
  H: { dx: 1, dy: 0 },
  V: { dx: 0, dy: 1 },
  DR: { dx: 1, dy: 1 },
  DL: { dx: -1, dy: 1 },
};

const DIFFICULTY = [
  { label: "Level 1", rows: 8,  cols: 8,  dirs: ["H"],                     words: 6  },
  { label: "Level 2", rows: 9,  cols: 9,  dirs: ["H", "V"],                words: 8  },
  { label: "Level 3", rows: 10, cols: 10, dirs: ["H", "V", "DR"],          words: 10 },
  { label: "Level 4", rows: 11, cols: 11, dirs: ["H", "V", "DR", "DL"],    words: 12 },
  { label: "Level 5", rows: 12, cols: 12, dirs: ["H", "V", "DR", "DL"],    words: 16 },
  { label: "Level 6", rows: 13, cols: 13, dirs: ["H", "V", "DR", "DL"],    words: 20 },
];

const MAX_ATTEMPTS = 2500;
const PALETTE = ["#9B5DE5", "#F15BB5", "#FF9F43", "#6C5CE7", "#2ED573"];
const MAX_CELL_PX = 34;
const letters = "abcdefghijklmnopqrstuvwxyz";
const urduLetters = "ابپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے";

/* ===================== Helpers ===================== */
function getRomanForms(item) {
  if (!item) return [];

  const forms = [];

  if (item.word?.baseRomanUrdu) {
    forms.push(String(item.word.baseRomanUrdu).trim());
  }

  if (Array.isArray(item.variants)) {
    item.variants.forEach((variant) => {
      if (variant?.romanUrdu) {
        forms.push(String(variant.romanUrdu).trim());
      }
    });
  }

  return [...new Set(forms.filter(Boolean))];
}

function getBaseRoman(item) {
  return item?.word?.baseRomanUrdu ? String(item.word.baseRomanUrdu).trim() : "";
}

function getEnglish(item) {
  return item?.word?.english ? String(item.word.english).trim() : "";
}

function getUrdu(item) {
  return item?.word?.baseUrdu ? String(item.word.baseUrdu).trim() : "";
}

function buildWords() {
  const ALLOWED_WORDS = window.ALLOWED_WORDS;
  const ALLOWED_WORDS_LOWER =
    ALLOWED_WORDS instanceof Set
      ? new Set([...ALLOWED_WORDS].map((w) => String(w).trim().toLowerCase()))
      : null;

  const source = Array.isArray(originalVocab) ? originalVocab : [];

  const words = source
    .filter((item) => getEnglish(item) && getRomanForms(item).length)
    .flatMap((item) => {
      const en = getEnglish(item);
      const ur = getUrdu(item);
      return getRomanForms(item).map((ru) => ({
        en,
        ru: String(ru).trim(),
        ur,
      }));
    })
    .filter((w) => {
      if (!ALLOWED_WORDS_LOWER) return true;
      return ALLOWED_WORDS_LOWER.has(w.ru.toLowerCase());
    });

  console.log("========== WORD SEARCH DEBUG ==========");
  const allowedCount = ALLOWED_WORDS instanceof Set ? ALLOWED_WORDS.size : 0;
  console.log("[word-search] Total ALLOWED_WORDS:", allowedCount);
  console.log(
    "[word-search] ALLOWED_WORDS:",
    ALLOWED_WORDS instanceof Set ? [...ALLOWED_WORDS] : ALLOWED_WORDS
  );

  const vocabRoman = new Set(
    source
      .flatMap((item) => getRomanForms(item))
      .map((w) => String(w).trim().toLowerCase())
      .filter(Boolean)
  );

  console.log("[word-search] Total vocab roman forms available:", vocabRoman.size);
  console.log("[word-search] Total words loaded into WORDS:", words.length);
  console.log(
    "[word-search] Loaded romanUrdu:",
    words.map((w) => w.ru.toLowerCase())
  );

  if (ALLOWED_WORDS_LOWER) {
    const missing = [...ALLOWED_WORDS_LOWER].filter((w) => !vocabRoman.has(w));
    if (missing.length) {
      console.warn("[word-search] ❌ Words NOT found in mastervocab.js:", missing);
    } else {
      console.log("[word-search] ✅ All allowed words exist in mastervocab.js");
    }
  }
  console.log("======================================");

  return words;
}

// WORDS populated in init()
let WORDS = [];

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
  timerOn: true,
  t0: 0,
  tId: null,
  userTimerOverridden: false,
  clueSide: "en",
  difficultyIdx: 0,
  allowedDirs: DIFFICULTY[0].dirs.slice(),
};

/* ===================== Utils ===================== */
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const rand = (n) => Math.floor(Math.random() * n);
const choice = (arr) => arr[rand(arr.length)];
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z\u0600-\u06FF\u0750-\u077F]/g, "");
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
  const min = +el.min;
  const max = +el.max;
  const val = +el.value;
  el.style.setProperty("--p", ((val - min) / (max - min)) * 100 + "%");
}

function getAllowedDirs() {
  if (state.clueSide === "ur") {
    // Mirror x-axis so horizontal words read right-to-left
    return state.allowedDirs.map((k) => {
      const d = DIRS[k];
      return { dx: -d.dx, dy: d.dy };
    });
  }
  return state.allowedDirs.map((k) => DIRS[k]);
}

/* ===================== Slider ===================== */
const levelRange = document.getElementById("levelRange");
const levelLabel = document.getElementById("levelLabel");

const densityRange = document.getElementById("densityRange");
if (densityRange) {
  densityRange.closest(".slider-group")?.setAttribute("hidden", "true");
}

function syncDifficultyUI() {
  if (!levelRange || !levelLabel) return;
  levelRange.min = "0";
  levelRange.max = String(DIFFICULTY.length - 1);
  levelRange.step = "1";
  levelRange.value = String(state.difficultyIdx);
  const wordCount = computeWordCountForCurrentDifficulty();
  levelLabel.textContent = `${DIFFICULTY[state.difficultyIdx].label} · ${wordCount} words`;
  updateRangeFill(levelRange);
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
    const rr = r + dir.dy * i;
    const cc = c + dir.dx * i;

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
    const rr = r + dir.dy * i;
    const cc = c + dir.dx * i;
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
      const r = rand(rows);
      const c = rand(cols);

      if (canPlaceSize(grid, target, r, c, dir, rows, cols, allowOverlap)) {
        const cells = placeWordSize(grid, target, r, c, dir);
        placed.push({ id: p.id, text: target, clue: p.clue, color: p.color, cells });
        ok = true;
      }
    }

    if (!ok) {
      outer: for (const dir of dirs) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (canPlaceSize(grid, target, r, c, dir, rows, cols, allowOverlap)) {
              const cells = placeWordSize(grid, target, r, c, dir);
              placed.push({ id: p.id, text: target, clue: p.clue, color: p.color, cells });
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
      const fill = state.clueSide === "ur" ? urduLetters : letters;
      if (!grid[r][c]) grid[r][c] = fill[rand(fill.length)];
    }
  }

  return { success: true, grid, placed, rows, cols };
}

/* ===================== Word count from density ===================== */
function computeWordCountForCurrentDifficulty() {
  const D = DIFFICULTY[state.difficultyIdx];
  return Math.min(WORDS.length, D.words);
}

/* ===================== Build Puzzle ===================== */
function buildPuzzle() {
  if (WORDS.length === 0) {
    console.error("[word-search] No WORDS available after filtering by window.ALLOWED_WORDS.");
    alert("No allowed words found. Check window.ALLOWED_WORDS and mastervocab.js romanUrdu values.");
    return;
  }

  const D = DIFFICULTY[state.difficultyIdx];
  state.rows = D.rows;
  state.cols = D.cols;
  state.allowedDirs = D.dirs.slice();

  const N = computeWordCountForCurrentDifficulty();
  const chosen = shuffle([...WORDS]).slice(0, Math.min(N, WORDS.length));

  const pairs = chosen
    .filter((w) => state.clueSide !== "ur" || w.ur)
    .map((w, idx) => {
      let target, clue;
      if (state.clueSide === "ur") {
        target = w.ur;
        clue = w.en;
      } else if (state.clueSide === "en") {
        target = w.ru;
        clue = w.en;
      } else {
        target = w.en;
        clue = w.ru;
      }
      const color = PALETTE[idx % PALETTE.length];
      return { id: `${idx}_${Date.now()}`, clue, target, color };
    });

  const dirs = getAllowedDirs();
  const tryLayout = (r, c, overlap = false) =>
    layoutWordsForSize(pairs, r, c, overlap, dirs);

  let res = tryLayout(state.rows, state.cols, false);
  if (!res.success) res = tryLayout(state.rows, state.cols, true);

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
    console.error("[word-search] Could not generate puzzle even after expanding board.");
    alert("Too many or long words for this setup. Try a lower level.");
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

  const clueLabels = { en: "English", ru: "Roman Urdu", ur: "English" };
  const gridLabels = { en: "Roman Urdu", ru: "English", ur: "اردو" };

  if (legendClues) {
    legendClues.innerHTML = `<span class="pill">Clues: ${clueLabels[state.clueSide]}</span>`;
  }
  if (legendGrid) {
    legendGrid.innerHTML = `<span class="pill">Find: ${gridLabels[state.clueSide]}</span>`;
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

    const answer = document.createElement("span");
    answer.className = "answer-reveal";
    answer.textContent = `→ ${w.text}`;

    const leftWrap = document.createElement("span");
    leftWrap.style.display = "inline-flex";
    leftWrap.style.alignItems = "center";
    leftWrap.append(dot, label, answer);

    li.append(leftWrap);
    li.addEventListener("click", (ev) => {
      ev.stopPropagation();
      flashFirstCell(w.id);
    });

    ul.appendChild(li);
  }
}

/* ===================== Mobile Clue Carousel (manual swipe only) ===================== */
let slidesPerView = 2;

function applySlidesPerView() {
  const ul = qs("#clues");
  if (!ul) return;
  const w = ul.clientWidth;
  slidesPerView = w >= 560 ? 3 : 2;
  ul.style.setProperty("--slides", String(slidesPerView));
}

function setupClueCarousel() {
  const ul = qs("#clues");
  if (!ul) return;
  applySlidesPerView();
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

  const isUrdu = state.clueSide === "ur";
  const maxCell = isUrdu ? 42 : MAX_CELL_PX;
  const cellsBand = panelInnerWidth - paddingX - borderX - gap * (state.cols - 1);
  const cell = Math.min(maxCell, Math.max(26, Math.floor(cellsBand / state.cols)));

  g.style.gridTemplateColumns = `repeat(${state.cols}, ${cell}px)`;
  g.style.gridAutoRows = `${cell}px`;
  g.classList.toggle("urdu-grid", isUrdu);

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const d = document.createElement("div");
      d.className = "cell" + (isUrdu ? " urdu-cell" : "");
      d.style.width = `${cell}px`;
      d.style.height = `${cell}px`;
      d.style.fontSize = isUrdu
        ? `${Math.max(11, Math.floor(cell * 0.4))}px`
        : `${Math.max(12, Math.floor(cell * 0.52))}px`;
      d.style.lineHeight = "1";
      d.dataset.r = r;
      d.dataset.c = c;
      d.textContent = state.grid[r][c];
      d.classList.add("entrance");
      d.style.animationDelay = `${(r * state.cols + c) * 8}ms`;
      d.addEventListener("pointerdown", onStart);
      d.addEventListener("pointerenter", onMove);
      d.addEventListener("pointerup", onEnd);
      g.appendChild(d);
    }
  }

  g.addEventListener("pointerleave", () => {
    if (state.isDragging) clearSelection();
  });
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

  const dr = b.r - a.r;
  const dc = b.c - a.c;
  const adR = Math.abs(dr);
  const adC = Math.abs(dc);

  if (!(adR === 0 || adC === 0 || adR === adC)) return;

  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
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
  qsa(".cell").forEach((el) => {
    el.dataset.sel = "0";
  });

  for (const s of state.selection) {
    s.el.dataset.sel = "1";
  }
}

function clearSelection() {
  qsa(".cell").forEach((el) => {
    el.dataset.sel = "0";
  });
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
  allItems.forEach((item) => firstRects.set(item, item.getBoundingClientRect()));

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
    launchConfetti();

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
  if (!w || w.cells.length < 1) return;

  const cellsToFlash = w.cells.slice(0, 2);
  cellsToFlash.forEach((cell) => {
    const el = document.querySelector(`.cell[data-r="${cell.r}"][data-c="${cell.c}"]`);
    if (el) {
      el.classList.add("hint-flash");
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      setTimeout(() => el.classList.remove("hint-flash"), 1600);
    }
  });
}

/* ===================== Confetti ===================== */
function launchConfetti() {
  const colors = ["#9B5DE5", "#F15BB5", "#FF9F43", "#6C5CE7", "#2ED573"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.top = `${-10 - Math.random() * 20}px`;
    el.style.width = `${6 + Math.random() * 8}px`;
    el.style.height = `${6 + Math.random() * 8}px`;
    el.style.animationDelay = `${Math.random() * 0.5}s`;
    el.style.animationDuration = `${1 + Math.random() * 1}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
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
  if (!toolbar?.classList.contains("open")) return;

  const clickedInsideToolbar = toolbar.contains(e.target);
  const clickedToggle = menuToggle?.contains(e.target);

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

    if (scrolledDown && toolbar?.classList.contains("open")) {
      setMenu(false);
    }
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
    for (const w of state.wordsPlaced) {
      if (!state.found.has(w.id)) flashFirstCell(w.id);
    }
  });
}

const toggleTimerBtn = qs("#toggleTimer");
if (toggleTimerBtn) {
  toggleTimerBtn.style.display = "none";
}

const playAgainBtn = qs("#playAgain");
if (playAgainBtn) {
  playAgainBtn.addEventListener("click", () => {
    qs("#winModal")?.classList.remove("show");
    buildPuzzle();
  });
}

const closeModalBtn = qs("#closeModal");
if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    qs("#winModal")?.classList.remove("show");
  });
}

/* ===================== Clue chooser popover ===================== */
const clueBtn = qs("#clueBtn");
const clueMenu = qs("#clueMenu");

function updateClueUI() {
  if (!clueMenu || !clueBtn) return;

  const modeTexts = {
    en: "English → Roman Urdu",
    ru: "Roman Urdu → English",
    ur: "English → اردو",
  };
  const modeText = modeTexts[state.clueSide] || modeTexts.en;

  clueMenu.querySelectorAll('[role="menuitemradio"]').forEach((b) => {
    b.setAttribute("aria-checked", b.dataset.side === state.clueSide ? "true" : "false");
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
    // Position the fixed menu relative to the button
    const rect = clueBtn.getBoundingClientRect();
    clueMenu.style.top = `${rect.bottom + 8}px`;
    clueMenu.style.left = `${Math.max(8, rect.left)}px`;
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
  WORDS = buildWords();

  if (window.innerWidth <= 768) {
    setMenu(false);
  } else if (menuToggle && toolbar) {
    toolbar.classList.remove("collapsed", "open");
    menuToggle.textContent = "☰";
    menuToggle.setAttribute("aria-expanded", "false");
  }

  relocateStats();
  window.addEventListener("resize", relocateStats);
  window.addEventListener("resize", applySlidesPerView);

  syncDifficultyUI();
  selectDifficulty(0);
})();