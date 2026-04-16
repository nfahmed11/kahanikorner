import { vocab as originalVocab } from "./vocab.js";

// ==========================================================
// SPEED GRID — fast-paced image recognition game
// ==========================================================

// ---------- Vocab helpers ----------
function getRomanForms(card) {
  if (!card) return [];
  const forms = [];
  if (card.word?.baseRomanUrdu) forms.push(card.word.baseRomanUrdu);
  if (Array.isArray(card.variants)) {
    card.variants.forEach((v) => { if (v?.romanUrdu) forms.push(v.romanUrdu); });
  }
  return [...new Set(forms)];
}

function displayRoman(card) {
  const forms = getRomanForms(card);
  const matched = forms.find((w) => window.ALLOWED_WORDS?.has(w));
  return matched || card?.word?.baseRomanUrdu || "";
}

function matchesAllowed(card) {
  return getRomanForms(card).some((w) => window.ALLOWED_WORDS?.has(w));
}

function imageLoads(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

// ---------- Audio ----------
const sounds = {
  correct: new Audio("/qr/assets/audio/success.wav"),
  wrong: new Audio("/qr/assets/audio/incorrect.wav"),
};

function playSound(name) {
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}

// ---------- Build deck ----------
async function filterWithImages(cards) {
  const results = await Promise.all(
    cards.map(async (card) => {
      const ok = card?.image && typeof card.image === "string" &&
        !card.image.includes("noimage") && (await imageLoads(card.image));
      return { card, ok };
    })
  );
  return results.filter((r) => r.ok).map((r) => r.card);
}

async function buildDecks() {
  if (!Array.isArray(originalVocab)) return { target: [], distractor: [] };

  // Target deck: only allowed words with valid images
  const allowed = originalVocab.filter(matchesAllowed);
  const targetDeck = await filterWithImages(allowed);

  // Distractor pool: ALL vocab with valid images (preload in parallel)
  const allWithImages = await filterWithImages(originalVocab);

  console.log(`[speedgrid] Targets: ${targetDeck.length}, Distractor pool: ${allWithImages.length}`);
  return { target: targetDeck, distractor: allWithImages };
}

// ---------- Performance tracker ----------
const wordStats = new Map(); // id -> { seen, correct, wrong }

function getStats(id) {
  if (!wordStats.has(id)) wordStats.set(id, { seen: 0, correct: 0, wrong: 0 });
  return wordStats.get(id);
}

function recordResult(id, isCorrect) {
  const s = getStats(id);
  s.seen++;
  if (isCorrect) s.correct++;
  else s.wrong++;
}

// Smart pick — favor words user struggles with
function pickTargetCard(deck, recentIds) {
  // Score each card: higher = more likely to be picked
  const scored = deck
    .filter((c) => !recentIds.includes(c.id))
    .map((card) => {
      const s = getStats(card.id);
      // Unseen words get high priority, wrong words get boosted
      let weight = 10;
      if (s.seen > 0) {
        const accuracy = s.correct / s.seen;
        weight = (1 - accuracy) * 10 + 1; // 1-11 range
      }
      return { card, weight };
    });

  if (!scored.length) {
    // Fallback: pick random from full deck
    return deck[Math.floor(Math.random() * deck.length)];
  }

  // Weighted random selection
  const totalWeight = scored.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * totalWeight;
  for (const s of scored) {
    r -= s.weight;
    if (r <= 0) return s.card;
  }
  return scored[scored.length - 1].card;
}

// ---------- Difficulty levels ----------
// promptTypes are set dynamically based on user's mode choice
const LEVELS_ROMAN = [
  { gridSize: 4, cols: 2, promptTypes: ["roman"] },
  { gridSize: 6, cols: 3, promptTypes: ["roman"] },
  { gridSize: 9, cols: 3, promptTypes: ["roman"] },
  { gridSize: 12, cols: 4, promptTypes: ["roman"] },
];

const LEVELS_MIXED = [
  { gridSize: 4, cols: 2, promptTypes: ["roman"] },
  { gridSize: 6, cols: 3, promptTypes: ["roman", "urdu"] },
  { gridSize: 9, cols: 3, promptTypes: ["roman", "urdu"] },
  { gridSize: 12, cols: 4, promptTypes: ["roman", "urdu"] },
];

let LEVELS = LEVELS_ROMAN;

function getLevel(correctTotal) {
  if (correctTotal >= 20) return 3;
  if (correctTotal >= 12) return 2;
  if (correctTotal >= 5) return 1;
  return 0;
}

// ---------- Combo system ----------
function getMultiplier(combo) {
  if (combo >= 10) return 5;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

// ---------- Particles ----------
function burstAt(x, y) {
  const container = document.createElement("div");
  container.className = "particle-burst";
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;

  const colors = ["#ff6b6b", "#7c5cbf", "#2ec4b6", "#f59e0b", "#22c55e", "#f472b6"];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 30 + Math.random() * 40;
    p.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
    p.style.width = p.style.height = `${6 + Math.random() * 4}px`;
    p.style.background = colors[i % colors.length];
    container.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 700);
}

// Float score text
function floatText(x, y, text, cls) {
  const el = document.createElement("div");
  el.className = `float-score ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Level-up flash
function showLevelFlash(levelNum) {
  const el = document.createElement("div");
  el.className = "level-flash";
  el.textContent = `Level ${levelNum + 1}!`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ---------- LocalStorage high score ----------
const HS_KEY = "speedgrid-highscore";

function getHighScore() {
  return Number(localStorage.getItem(HS_KEY)) || 0;
}

function setHighScore(score) {
  const prev = getHighScore();
  if (score > prev) {
    localStorage.setItem(HS_KEY, String(score));
    return true;
  }
  return false;
}

// ==========================================================
// MAIN GAME
// ==========================================================
document.addEventListener("DOMContentLoaded", async () => {
  // Screens
  const screenStart = document.getElementById("screen-start");
  const screenGame = document.getElementById("screen-game");
  const screenEnd = document.getElementById("screen-end");

  // Start
  const startBest = document.getElementById("start-best");
  const btnPlay = document.getElementById("btn-play");
  const modeRomanBtn = document.getElementById("mode-roman");
  const modeMixedBtn = document.getElementById("mode-mixed");

  // Mode toggle
  modeRomanBtn.addEventListener("click", () => {
    LEVELS = LEVELS_ROMAN;
    modeRomanBtn.classList.add("active");
    modeMixedBtn.classList.remove("active");
  });

  modeMixedBtn.addEventListener("click", () => {
    LEVELS = LEVELS_MIXED;
    modeMixedBtn.classList.add("active");
    modeRomanBtn.classList.remove("active");
  });

  // HUD
  const timerText = document.getElementById("timer-text");
  const hudTimer = document.getElementById("hud-timer");
  const hudLevel = document.getElementById("hud-level");
  const hudCombo = document.getElementById("hud-combo");
  const comboText = document.getElementById("combo-text");
  const scoreText = document.getElementById("score-text");
  const promptEl = document.getElementById("prompt");
  const promptWord = document.getElementById("prompt-word");
  const gridEl = document.getElementById("grid");

  // End
  const endEmoji = document.getElementById("end-emoji");
  const endTitle = document.getElementById("end-title");
  const endScore = document.getElementById("end-score");
  const endBestCombo = document.getElementById("end-best-combo");
  const endCorrect = document.getElementById("end-correct");
  const endHighscore = document.getElementById("end-highscore");
  const btnRetry = document.getElementById("btn-retry");

  // Build decks
  const { target: fullDeck, distractor: distractorPool } = await buildDecks();

  if (!fullDeck.length) {
    startBest.textContent = "No images available for these words.";
    btnPlay.disabled = true;
    btnPlay.style.opacity = "0.5";
    return;
  }

  // Show high score on start
  const hs = getHighScore();
  if (hs > 0) startBest.textContent = `High Score: ${hs}`;

  // ---------- Game state ----------
  let timer, score, combo, bestCombo, correctTotal, wrongTotal;
  let currentLevel, currentTarget, recentIds;
  let timerInterval;
  let locked = false;

  function showScreen(screen) {
    screenStart.classList.add("hidden");
    screenGame.classList.add("hidden");
    screenEnd.classList.add("hidden");
    screen.classList.remove("hidden");
  }

  // ---------- Start game ----------
  function startGame() {
    timer = 60;
    score = 0;
    combo = 0;
    bestCombo = 0;
    correctTotal = 0;
    wrongTotal = 0;
    currentLevel = -1;
    recentIds = [];
    locked = false;
    wordStats.clear();

    updateHUD();
    showScreen(screenGame);
    nextRound();

    clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);
  }

  function tick() {
    timer--;
    updateTimerDisplay();
    if (timer <= 0) {
      timer = 0;
      updateTimerDisplay();
      endGame();
    }
  }

  function updateTimerDisplay() {
    timerText.textContent = Math.max(0, Math.ceil(timer));
    hudTimer.classList.toggle("danger", timer <= 5);
  }

  function updateHUD() {
    scoreText.textContent = score;
    updateTimerDisplay();

    const mult = getMultiplier(combo);
    comboText.textContent = `x${mult}`;
    hudCombo.classList.toggle("fire", mult >= 3);

    const lvl = getLevel(correctTotal);
    hudLevel.textContent = `Level ${lvl + 1}`;
  }

  // ---------- Next round ----------
  function nextRound() {
    const newLvl = getLevel(correctTotal);
    if (newLvl !== currentLevel) {
      if (currentLevel >= 0) showLevelFlash(newLvl);
      currentLevel = newLvl;
    }

    const level = LEVELS[currentLevel];
    const gridSize = Math.min(level.gridSize, fullDeck.length);
    const cols = level.cols;

    // Pick target
    const target = pickTargetCard(fullDeck, recentIds);
    currentTarget = target;

    // Track recent to avoid repeats
    recentIds.push(target.id);
    if (recentIds.length > 5) recentIds.shift();

    // Pick distractors from the FULL vocab pool (not just allowed words)
    const distractors = distractorPool
      .filter((c) => c.id !== target.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, gridSize - 1);

    const cards = [...distractors, target].sort(() => Math.random() - 0.5);

    // Pick prompt type
    const promptTypes = level.promptTypes;
    const pType = promptTypes[Math.floor(Math.random() * promptTypes.length)];

    let word;
    if (pType === "urdu") {
      word = target.word?.baseUrdu || displayRoman(target);
      promptWord.className = "prompt-word urdu-text";
    } else if (pType === "english") {
      word = target.word?.english || displayRoman(target);
      promptWord.className = "prompt-word";
    } else {
      word = displayRoman(target);
      promptWord.className = "prompt-word";
    }

    promptWord.textContent = word;
    promptEl.classList.remove("pop");
    void promptEl.offsetWidth; // force reflow
    promptEl.classList.add("pop");

    // Build grid
    gridEl.style.setProperty("--cols", cols);
    gridEl.innerHTML = "";

    cards.forEach((card) => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.id = card.id;

      const img = document.createElement("img");
      img.src = card.image;
      img.alt = card.word?.english || "";
      img.draggable = false;

      cell.appendChild(img);
      gridEl.appendChild(cell);
    });

    locked = false;
  }

  // ---------- Handle tap (event delegation) ----------
  gridEl.addEventListener("click", (e) => {
    if (locked) return;

    const cell = e.target.closest(".cell");
    if (!cell || cell.classList.contains("locked")) return;

    locked = true;
    const tappedId = cell.dataset.id;
    const isCorrect = tappedId === currentTarget.id;
    const rect = cell.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Lock all cells
    gridEl.querySelectorAll(".cell").forEach((c) => c.classList.add("locked"));

    recordResult(currentTarget.id, isCorrect);

    if (isCorrect) {
      // CORRECT
      cell.classList.add("correct");
      playSound("correct");
      burstAt(cx, cy);

      combo++;
      if (combo > bestCombo) bestCombo = combo;
      correctTotal++;

      const mult = getMultiplier(combo);
      const points = 10 * mult;
      score += points;
      timer += 1.5;

      floatText(cx, cy - 20, `+${points}`, "plus");
      updateHUD();

      // Fast transition — next round after short delay
      setTimeout(nextRound, 350);

    } else {
      // WRONG
      cell.classList.add("wrong");
      playSound("wrong");

      combo = 0;
      wrongTotal++;
      timer -= 2;
      if (timer < 0) timer = 0;

      floatText(cx, cy - 20, "-2s", "minus");

      // Reveal correct answer
      const correctCell = gridEl.querySelector(`.cell[data-id="${currentTarget.id}"]`);
      if (correctCell) correctCell.classList.add("reveal");

      updateHUD();

      // Longer delay so user sees the correct answer
      setTimeout(() => {
        if (timer <= 0) {
          endGame();
        } else {
          nextRound();
        }
      }, 1200);
    }
  });

  // ---------- End game ----------
  function endGame() {
    clearInterval(timerInterval);
    locked = true;

    const isNew = setHighScore(score);

    let emoji = "🎉", title = "Zabardast!";
    if (score === 0) { emoji = "💪"; title = "Keep trying!"; }
    else if (score < 50) { emoji = "⭐"; title = "Acha tha!"; }
    else if (score < 150) { emoji = "🌟"; title = "Bohat khoob!"; }

    endEmoji.textContent = emoji;
    endTitle.textContent = title;
    endScore.textContent = score;
    endBestCombo.textContent = bestCombo;
    endCorrect.textContent = correctTotal;
    endHighscore.textContent = isNew ? "New High Score!" : (getHighScore() > 0 ? `High Score: ${getHighScore()}` : "");

    showScreen(screenEnd);
  }

  // ---------- Buttons ----------
  btnPlay.addEventListener("click", startGame);
  btnRetry.addEventListener("click", startGame);
});
