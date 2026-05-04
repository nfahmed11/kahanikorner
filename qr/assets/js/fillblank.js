/**
 * fillblank.js — Kahani Korner · Fill-in-the-Blank AI Game
 * ─────────────────────────────────────────────────────────────
 * Lives at: /qr/assets/js/fillblank.js
 *
 * Vocab:     imports mastervocab.js from same folder (./mastervocab.js)
 *            filtered by window.ALLOWED_WORDS (from ?words= URL param)
 *
 * Sentences: POST /api/generate-sentence → Firebase Function → OpenAI
 *            (locally: Express server in qr/assets/ai-activities/fillblank/)
 *
 * To swap AI backend: edit only fetchSentence() below.
 */

"use strict";

import { vocab as masterVocab } from "./mastervocab.js";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const SETTINGS_KEY   = "kk-fillblank-settings";
const API_ENDPOINT   = "/api/generate-sentence";
const WORD_BANK_SIZE = 5;   // 1 correct + 4 distractors
const REVEAL_AFTER   = 3;   // show "show answer" after N wrong attempts

// ─────────────────────────────────────────────────────────────
// DEFAULT SETTINGS
// ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  difficulty:   "easy",
  showUrdu:     true,
  showRoman:    true,
  showEnglish:  false,
  soundEnabled: true,
};

// ─────────────────────────────────────────────────────────────
// FEEDBACK COPY
// ─────────────────────────────────────────────────────────────

const FEEDBACK = {
  correct: [
    "Nice job! 🎉", "That's right!", "You got it!", "Great work!",
    "Excellent!", "Shabash! (Well done!)", "Bilkul sahi! (Exactly right!)",
    "Wah wah! Keep it up!", "Brilliant!",
  ],
  incorrect: [
    "Oops, try another one.", "Not quite — give it another go!",
    "Almost! Try again.", "Keep going, you've got this!",
    "That's okay — try a different one.",
  ],
};

// ─────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────

const SFX = (() => {
  let correct, incorrect;
  return {
    play(name) {
      try {
        if (name === "correct") {
          correct = correct || new Audio("/qr/assets/audio/success.wav");
          correct.currentTime = 0;
          correct.play().catch(() => {});
        } else if (name === "incorrect") {
          incorrect = incorrect || new Audio("/qr/assets/audio/incorrect.wav");
          incorrect.currentTime = 0;
          incorrect.play().catch(() => {});
        }
      } catch (_) {}
    },
  };
})();

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let settings      = { ...DEFAULT_SETTINGS };
let pool          = [];
let usedIds       = [];
let currentQ      = null;
let answered      = false;
let wrongCount    = 0;
let points        = 0;
let streak        = 0;
let nextQWordId   = null;   // word id reserved by cancelPrefetch cleanup
let sentenceCache = {};     // wordId → Promise<question> for bulk pre-generation
let cacheAbort    = false;  // set true to cancel an in-progress bulk generation

// ─────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────

const dom = {
  scorePoints:     q("#score-points"),
  streakBadge:     q("#streak-badge"),
  progressFill:    q("#progress-fill"),
  progressLabel:   q("#progress-label"),
  stateLoading:    q("#state-loading"),
  stateError:      q("#state-error"),
  stateQuestion:   q("#state-question"),
  errorMsg:        q("#error-msg"),
  errorRetry:      q("#error-retry-btn"),
  difficultyBadge: q("#difficulty-badge"),
  wordHint:        q("#word-hint"),
  rowUrdu:         q("#row-urdu"),
  rowRoman:        q("#row-roman"),
  rowEnglish:      q("#row-english"),
  sentenceUrdu:    q("#sentence-urdu"),
  sentenceRoman:   q("#sentence-roman"),
  sentenceEnglish: q("#sentence-english"),
  feedbackArea:    q("#feedback-area"),
  wordBank:        q("#word-bank"),
  revealBtn:       q("#reveal-btn"),
  nextBtn:         q("#next-btn"),
  confettiBox:     q("#confetti-container"),
};

function q(sel) {
  const el = document.querySelector(sel);
  if (!el) console.warn(`[fillblank] Missing DOM element: "${sel}"`);
  return el;
}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (stored) settings = { ...DEFAULT_SETTINGS, ...stored };
  } catch (_) {}
  // Guard: stale localStorage must never hide all scripts
  if (!settings.showRoman && !settings.showUrdu && !settings.showEnglish) {
    settings.showRoman = true;
    settings.showUrdu  = true;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  qAll(".difficulty-pill").forEach((p) =>
    p.classList.toggle("active", p.dataset.value === settings.difficulty)
  );
  qAll(".script-pill").forEach((p) => {
    const on = p.dataset.script === "roman"   ? settings.showRoman
             : p.dataset.script === "urdu"    ? settings.showUrdu
             : settings.showEnglish;
    p.classList.toggle("active", on);
    p.setAttribute("aria-pressed", String(on));
  });
  setToggle("toggle-sound", settings.soundEnabled);
  applySentenceVisibility();
}

function setToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("aria-checked", String(val));
}

function applySentenceVisibility() {
  dom.rowUrdu.hidden    = !settings.showUrdu;
  dom.rowRoman.hidden   = !settings.showRoman;
  dom.rowEnglish.hidden = !settings.showEnglish;
}

// ─────────────────────────────────────────────────────────────
// VOCAB POOL
// Cross-references window.ALLOWED_WORDS (Set from ?words= param)
// with mastervocab.js — matches on id OR baseRomanUrdu.
// ─────────────────────────────────────────────────────────────

function buildPool() {
  const allowed = window.ALLOWED_WORDS;

  if (!allowed || allowed.size === 0) {
    pool = [...masterVocab];
    return;
  }

  pool = masterVocab.filter((entry) =>
    allowed.has(entry.id) || allowed.has(entry.word?.baseRomanUrdu)
  );

  const missing = [...allowed].filter(
    (w) => !masterVocab.some((e) => e.id === w || e.word?.baseRomanUrdu === w)
  );
  if (missing.length) {
    console.warn("[fillblank] IDs not found in mastervocab:", missing);
  }

  if (pool.length === 0) {
    console.error("[fillblank] Pool empty — falling back to full vocab.");
    pool = [...masterVocab];
  }
}

// ─────────────────────────────────────────────────────────────
// WORD PICKER  (cycles all before repeating)
// ─────────────────────────────────────────────────────────────

function pickWord() {
  if (pool.length === 0) return null;
  if (usedIds.length >= pool.length) usedIds = [];
  const available = pool.filter((w) => !usedIds.includes(w.id));
  const word = available[Math.floor(Math.random() * available.length)];
  usedIds.push(word.id);
  return word;
}

// ─────────────────────────────────────────────────────────────
// API LAYER — only thing that talks to the server
// To swap AI backends: edit only this function.
// ─────────────────────────────────────────────────────────────

async function fetchSentence(wordObj, difficulty) {
  const payload = {
    word: {
      id:        wordObj.id,
      urdu:      wordObj.word.baseUrdu,
      romanUrdu: wordObj.word.baseRomanUrdu,
      english:   wordObj.word.english,
      pos:       wordObj.word.pos             || "unknown",
      gender:    wordObj.grammar?.baseGender  || "unknown",
      variants:  (wordObj.variants || []).map((v) => ({
        urdu:      v.urdu,
        romanUrdu: v.romanUrdu,
      })),
    },
    difficulty,
  };

  const res  = await fetch(API_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `Server error ${res.status}`);
  }

  return data.sentence;
}

// ─────────────────────────────────────────────────────────────
// WORD BANK BUILDER
// ─────────────────────────────────────────────────────────────

// Returns true if two Roman Urdu words look too similar to be fair distractors.
function tooSimilar(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase().replace(/[^a-z]/g, "");
  const y = b.toLowerCase().replace(/[^a-z]/g, "");
  if (x === y) return true;
  // One is a prefix of the other (e.g. "kitab" / "kitabchi")
  if (x.startsWith(y) || y.startsWith(x)) return true;
  // Share the same first 3 characters (e.g. "ghar" / "ghanta")
  if (x.length >= 3 && y.length >= 3 && x.slice(0, 3) === y.slice(0, 3)) return true;
  return false;
}

function buildWordBank(targetWordObj, sentence) {
  const correctChip = {
    roman:     sentence.answerRoman,
    urdu:      sentence.answerUrdu,
    english:   sentence.answerEnglish || "",
    isCorrect: true,
  };

  const correctRoman = sentence.answerRoman;
  const targetPos    = targetWordObj.word?.pos;

  const candidates = pool.filter((w) => w.id !== targetWordObj.id);

  // Tier 1 — different POS and clearly different spelling (best distractors)
  const tier1 = candidates.filter(
    (w) => w.word?.pos !== targetPos && !tooSimilar(w.word.baseRomanUrdu, correctRoman)
  );
  // Tier 2 — different spelling but same POS (still acceptable)
  const tier2 = candidates.filter(
    (w) => w.word?.pos === targetPos && !tooSimilar(w.word.baseRomanUrdu, correctRoman)
  );
  // Tier 3 — anything that isn't the exact correct word (last resort)
  const tier3 = candidates.filter(
    (w) => tooSimilar(w.word.baseRomanUrdu, correctRoman)
  );

  const ordered = [
    ...tier1.sort(() => Math.random() - 0.5),
    ...tier2.sort(() => Math.random() - 0.5),
    ...tier3.sort(() => Math.random() - 0.5),
  ];

  const distractors = ordered.slice(0, WORD_BANK_SIZE - 1).map((w) => ({
    roman:     w.word.baseRomanUrdu,
    urdu:      w.word.baseUrdu || "",
    english:   w.word.english  || "",
    isCorrect: false,
  }));

  return [...distractors, correctChip].sort(() => Math.random() - 0.5);
}

// ─────────────────────────────────────────────────────────────
// GAME LAYER
// ─────────────────────────────────────────────────────────────

async function buildQuestion(wordObj, difficulty) {
  const sentence = await fetchSentence(wordObj, difficulty);
  const wordBank = buildWordBank(wordObj, sentence);
  return { wordObj, sentence, wordBank };
}

// ─────────────────────────────────────────────────────────────
// RENDER LAYER
// ─────────────────────────────────────────────────────────────

function showState(state) {
  dom.stateLoading.hidden  = state !== "loading";
  dom.stateError.hidden    = state !== "error";
  dom.stateQuestion.hidden = state !== "question";
}

function renderQuestion({ wordObj, sentence, wordBank }) {
  dom.difficultyBadge.textContent        = capitalize(sentence.level);
  dom.difficultyBadge.dataset.difficulty = sentence.level;
  dom.wordHint.textContent = wordObj.word.english
    ? `Hint: "${wordObj.word.english}"` : "";

  dom.sentenceUrdu.textContent    = sentence.urduBlank;
  dom.sentenceRoman.textContent   = sentence.romanBlank;
  dom.sentenceEnglish.textContent = sentence.englishBlank || sentence.englishTranslation;

  dom.sentenceUrdu.classList.remove("revealed");
  dom.sentenceRoman.classList.remove("revealed");
  dom.sentenceEnglish.classList.remove("revealed");

  applySentenceVisibility();
  renderWordBank(wordBank);
  clearFeedback();

  dom.nextBtn.hidden   = true;
  dom.revealBtn.hidden = true;
  wrongCount = 0;
}

function renderWordBank(wordBank) {
  dom.wordBank.innerHTML = "";
  const activeCount = [settings.showRoman, settings.showUrdu, settings.showEnglish].filter(Boolean).length;
  const stacked = activeCount > 1;

  wordBank.forEach((chip) => {
    const btn = document.createElement("button");
    btn.type           = "button";
    btn.className      = "word-chip" + (stacked ? " word-chip--stacked" : "");
    btn.dataset.roman  = chip.roman;   // used for correct-answer identification

    if (settings.showRoman && chip.roman) {
      const span = document.createElement("span");
      span.className   = "chip-roman";
      span.textContent = chip.roman;
      btn.appendChild(span);
    }
    if (settings.showUrdu && chip.urdu) {
      const span = document.createElement("span");
      span.className   = "chip-urdu";
      span.textContent = chip.urdu;
      btn.appendChild(span);
    }
    if (settings.showEnglish && chip.english) {
      const span = document.createElement("span");
      span.className   = "chip-english";
      span.textContent = chip.english;
      btn.appendChild(span);
    }

    btn.addEventListener("click", () => handleAnswer(chip, btn));
    dom.wordBank.appendChild(btn);
  });
}

function revealSentence(sentence) {
  if (settings.showUrdu) {
    dom.sentenceUrdu.textContent = sentence.urduFull;
    dom.sentenceUrdu.classList.add("revealed");
  }
  if (settings.showRoman) {
    dom.sentenceRoman.textContent = sentence.romanFull;
    dom.sentenceRoman.classList.add("revealed");
  }
  if (settings.showEnglish) {
    dom.sentenceEnglish.textContent = sentence.englishTranslation;
    dom.sentenceEnglish.classList.add("revealed");
  }
}

// ─────────────────────────────────────────────────────────────
// ANSWER HANDLING
// ─────────────────────────────────────────────────────────────

function handleAnswer(chip, btnEl) {
  if (answered) return;

  const allChips = qAll(".word-chip");

  if (chip.isCorrect) {
    answered = true;
    // 3 pts on first try, 2 on second, 1 on third or beyond
    const earned = wrongCount === 0 ? 3 : wrongCount === 1 ? 2 : 1;
    points += earned;
    streak++;
    wrongCount = 0;

    btnEl.classList.add("chip--correct");
    allChips.forEach((b) => { b.disabled = true; });

    showFeedback("correct", earned);
    revealSentence(currentQ.sentence);
    dom.nextBtn.hidden   = false;
    dom.revealBtn.hidden = true;

    updateScoreboard();
    if (settings.soundEnabled) SFX.play("correct");
    launchConfetti();
    setTimeout(loadNextQuestion, 1700);

  } else {
    wrongCount++;
    streak = 0;

    btnEl.classList.add("chip--wrong");
    btnEl.disabled = true;

    showFeedback("incorrect");
    if (settings.soundEnabled) SFX.play("incorrect");
    if (wrongCount >= REVEAL_AFTER) dom.revealBtn.hidden = false;
  }

  updateStreak();
}

// ─────────────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────────────

function showFeedback(type, earned) {
  const msgs = FEEDBACK[type] || [];
  let text = msgs[Math.floor(Math.random() * msgs.length)] || "";
  if (type === "correct" && earned !== undefined) {
    text += ` +${earned} pt${earned !== 1 ? "s" : ""}`;
  }
  dom.feedbackArea.textContent = text;
  dom.feedbackArea.className   = `feedback-area feedback--${type}`;
}

function clearFeedback() {
  dom.feedbackArea.textContent = "";
  dom.feedbackArea.className   = "feedback-area";
}

// ─────────────────────────────────────────────────────────────
// SCOREBOARD
// ─────────────────────────────────────────────────────────────

function updateScoreboard() {
  dom.scorePoints.textContent = points;
}

function updateWordProgress() {
  const shown = usedIds.length;
  const total = pool.length;
  const pct   = total > 0 ? Math.round((shown / total) * 100) : 0;
  dom.progressFill.style.width = `${pct}%`;
  dom.progressFill.parentElement.setAttribute("aria-valuenow", pct);
  dom.progressLabel.textContent = `${shown} / ${total}`;
}

function updateStreak() {
  dom.streakBadge.textContent = streak >= 2 ? `🔥 ${streak}` : "";
}

// ─────────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────────

function launchConfetti() {
  const colors = ["#a78bfa","#f472b6","#34d399","#fbbf24","#60a5fa","#fb923c","#c084fc"];
  for (let i = 0; i < 40; i++) {
    const dot  = document.createElement("div");
    const size = 5 + Math.random() * 9;
    dot.className = "confetti-dot";
    dot.style.cssText = `
      left:${30 + Math.random() * 40}%;
      width:${size}px;height:${size}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.4 ? "50%" : "2px"};
      animation-delay:${Math.random() * 0.5}s;
      animation-duration:${0.9 + Math.random() * 0.7}s;
    `;
    dom.confettiBox.appendChild(dot);
  }
  setTimeout(() => { dom.confettiBox.innerHTML = ""; }, 2200);
}

// ─────────────────────────────────────────────────────────────
// SENTENCE CACHE
// On page load (and on difficulty/reset), all sentences for the
// current pool are generated in the background with a concurrency
// limit so we don't hammer the API.  loadNextQuestion pulls from
// the cache and is instant for every sentence after the first.
// ─────────────────────────────────────────────────────────────

function cancelPrefetch() {
  if (nextQWordId !== null) {
    usedIds = usedIds.filter((id) => id !== nextQWordId);
    nextQWordId = null;
  }
}

// Discard the cache and signal any running bulk generation to stop.
function clearCache() {
  cacheAbort    = true;          // running loop checks this flag each iteration
  sentenceCache = {};
  cancelPrefetch();
  // Allow a new generation to start after this tick
  setTimeout(() => { cacheAbort = false; }, 0);
}

// Start generating sentences for every word in the pool, CONCURRENCY at a time.
// Words that are already in the cache are skipped.
async function warmCache(difficulty) {
  const CONCURRENCY = 3;
  const words = [...pool];      // snapshot — pool won't change during this run

  // Work through the pool in batches of CONCURRENCY
  for (let i = 0; i < words.length; i += CONCURRENCY) {
    if (cacheAbort) return;     // difficulty changed / reset — bail out

    const batch = words.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((wordObj) => {
        if (sentenceCache[wordObj.id]) return;   // already cached
        sentenceCache[wordObj.id] = buildQuestion(wordObj, difficulty)
          .catch(() => null);                     // failure → null, will live-fetch
      })
    );
  }
  console.log(`[fillblank] Cache warm — ${Object.keys(sentenceCache).length} sentences ready.`);
}

// Kick off background generation (non-blocking).
function startCacheWarm() {
  clearCache();
  warmCache(settings.difficulty);  // runs async in background, no await
}


// ─────────────────────────────────────────────────────────────
// QUESTION LOADER
// ─────────────────────────────────────────────────────────────

async function loadNextQuestion() {
  answered = false;
  currentQ = null;
  showState("loading");

  try {
    const wordObj = pickWord();
    if (!wordObj) throw new Error("No vocabulary words found. Check the ?words= URL parameter.");

    let q = null;

    // 1. Try the cache first
    if (sentenceCache[wordObj.id]) {
      q = await sentenceCache[wordObj.id];
      delete sentenceCache[wordObj.id];   // consume — cache entries are one-use
    }

    // 2. Cache miss or failed entry — live fetch
    if (!q) {
      console.log(`[fillblank] Cache miss for "${wordObj.word.baseRomanUrdu}" — fetching live.`);
      q = await buildQuestion(wordObj, settings.difficulty);
    }

    currentQ = q;
    renderQuestion(currentQ);
    showState("question");
    updateWordProgress();
  } catch (err) {
    console.error("[fillblank] Question load failed:", err);
    dom.errorMsg.textContent = err.message || "Could not generate a sentence. Please try again.";
    showState("error");
    cancelPrefetch();
  }
}

// ─────────────────────────────────────────────────────────────
// SETTINGS EVENTS
// ─────────────────────────────────────────────────────────────

function resetGame() {
  points     = 0;
  streak     = 0;
  wrongCount = 0;
  answered   = false;
  usedIds    = [];
  currentQ   = null;
  updateScoreboard();
  updateWordProgress();
  startCacheWarm();
}

function closeSettingsPanel() {
  document.getElementById("settings-panel")?.classList.remove("open");
  document.getElementById("settings-overlay")?.classList.remove("open");
  document.getElementById("settings-btn")?.setAttribute("aria-expanded", "false");
}

function bindSettingsEvents() {
  qAll(".difficulty-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      settings.difficulty = pill.dataset.value;
      cancelPrefetch();
      saveSettings();
      applySettings();
      resetGame();
      closeSettingsPanel();
      loadNextQuestion();
    });
  });

  // Event delegation — one listener on the panel catches all script pills
  document.getElementById("settings-panel")?.addEventListener("click", (e) => {
    const pill = e.target.closest(".script-pill");
    if (!pill) return;

    const script = pill.dataset.script;
    if (script === "roman")   settings.showRoman   = !settings.showRoman;
    if (script === "urdu")    settings.showUrdu    = !settings.showUrdu;
    if (script === "english") settings.showEnglish = !settings.showEnglish;

    // Always keep at least one script active
    if (!settings.showRoman && !settings.showUrdu && !settings.showEnglish) {
      settings.showRoman = true;
    }

    saveSettings();
    applySettings();
    if (currentQ) {
      renderWordBank(currentQ.wordBank);
      if (answered) revealSentence(currentQ.sentence);
    }
  });

  document.getElementById("toggle-sound")?.addEventListener("click", () => {
    settings.soundEnabled = !settings.soundEnabled;
    saveSettings();
    applySettings();
  });
}

// ─────────────────────────────────────────────────────────────
// KEYBOARD
// ─────────────────────────────────────────────────────────────

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !dom.nextBtn.hidden) {
      e.preventDefault();
      loadNextQuestion();
      return;
    }
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 5) {
      qAll(".word-chip:not(:disabled)")[num - 1]?.click();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function qAll(sel) { return [...document.querySelectorAll(sel)]; }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────

function init() {
  loadSettings();
  buildPool();
  bindSettingsEvents();
  bindKeyboard();
  applySettings();
  updateScoreboard();
  updateWordProgress();
  startCacheWarm();   // begin generating all sentences in the background

  dom.nextBtn?.addEventListener("click", loadNextQuestion);
  dom.errorRetry?.addEventListener("click", loadNextQuestion);

  dom.revealBtn?.addEventListener("click", () => {
    if (!currentQ || answered) return;
    answered = true;
    dom.revealBtn.hidden = true;

    qAll(".word-chip").forEach((btn) => {
      if (btn.dataset.roman === currentQ.sentence.answerRoman) {
        btn.classList.add("chip--correct");
      }
      btn.disabled = true;
    });

    revealSentence(currentQ.sentence);
    dom.nextBtn.hidden           = false;
    dom.feedbackArea.textContent = "Here's the answer — keep going!";
    dom.feedbackArea.className   = "feedback-area feedback--reveal";
  });

  loadNextQuestion();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
