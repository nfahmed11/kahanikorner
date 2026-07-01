/*
 * Fill the Kahani — Game Engine
 * Multi-line rounds · drag-and-drop · bilingual chips
 * Data: window.STORY_HOME_CONFIG.story.lines via sessionStorage "KAHANI_CURRENT_ISSUE"
 */

var genericTalkPrompts = [
  { romanUrdu: "Is lafz ke baare mein aik aur jumla bolo.",       urdu: "اس لفظ کے بارے میں ایک اور جملہ بولو۔",        english: "Say one more sentence about this word." },
  { romanUrdu: "Kya tumhein yeh pasand hai? Kyun?",               urdu: "کیا تمہیں یہ پسند ہے؟ کیوں؟",                  english: "Do you like this? Why?" },
  { romanUrdu: "Kya tum ne yeh pehle dekha hai?",                 urdu: "کیا تم نے یہ پہلے دیکھا ہے؟",                  english: "Have you seen this before?" },
  { romanUrdu: "Yeh humein kahan nazar aata hai?",                urdu: "یہ ہمیں کہاں نظر آتا ہے؟",                    english: "Where do we see this?" },
  { romanUrdu: "Tum is ke baare mein kis se baat kar sakte ho?",  urdu: "تم اس کے بارے میں کس سے بات کر سکتے ہو؟",     english: "Who can you talk to about this?" },
  { romanUrdu: "Yeh tumhein kaisa mehsoos karata hai?",           urdu: "یہ تمہیں کیسا محسوس کراتا ہے؟",               english: "How does this make you feel?" },
  { romanUrdu: "Kya tum aaj ghar mein yeh lafz istemal kar sakte ho?", urdu: "کیا تم آج گھر میں یہ لفظ استعمال کر سکتے ہو؟", english: "Can you use this word at home today?" }
];

(function () {
  'use strict';

  // ── Level config ──────────────────────────────────────────────────────────
  // linesPerRound = lines shown at once (= blanks per round)
  // bankSize      = total word-bank chips (correct + distractors)
  // storyOrder    = keep original line order vs shuffle
  var LEVEL_CONFIG = {
    1: { label: 'Easy',         linesPerRound: 1, bankSize: 4,  storyOrder: false },
    2: { label: 'Medium',       linesPerRound: 2, bankSize: 6,  storyOrder: false },
    3: { label: 'Hard',         linesPerRound: 4, bankSize: 10, storyOrder: false },
    4: { label: 'Story Review', linesPerRound: 4, bankSize: 12, storyOrder: true  }
  };

  // ── Roman Urdu stop words — never blank these ─────────────────────────────
  var STOP = (function () {
    var list = [
      'ne','ko','ka','ki','ke','se','mein','par','tha','thi','the','thay',
      'hain','hai','ho','hota','hoti','hote','hua','hui','hue',
      'aur','ya','nahi','nahin','bhi','to','toh','jo','hum','tum',
      'wo','woh','is','us','in','un','yeh','kya','koi','ab','phir',
      'ek','aik','sa','si','sab','agar','lekin','magar','hi',
      'jab','tab','tak','liye','uske','uski','iski','iska',
      'unka','unki','unke','apna','apni','apne',
      'kuch','bahut','bohat','sirf','har','dono','saath',
      'kar','gaya','gayi','gaye','aa','de','le','raha','rahi','rahe',
      'diya','liya','kiya','kiye','wala','wali','pe','ye','jis','jin',
      'baar','aisa','aisi','na','iss','uss','yahi','wahi',
      'kyun','kyunke','pas','paas','taraf','andar','bahar',
      'upar','neeche','pehle','baad','abhi','haan','baat'
    ];
    var obj = {};
    list.forEach(function (w) { obj[w] = true; });
    return obj;
  }());

  // Drag state — module-level so cleanupDrag can reach it from any path
  var _drag = { ghost: null, chip: null, moved: false, sx: 0, sy: 0 };

  function cleanupDrag() {
    if (_drag.ghost) { _drag.ghost.remove(); _drag.ghost = null; }
    if (_drag.chip)  { _drag.chip.classList.remove('dragging'); _drag.chip = null; }
    // Belt-and-suspenders: remove any orphaned ghosts
    document.querySelectorAll('.word-chip--ghost').forEach(function (el) { el.remove(); });
    document.querySelectorAll('.ftk-blank--over').forEach(function (el) { el.classList.remove('ftk-blank--over'); });
    _drag.moved = false;
  }

  // ── Data reading ──────────────────────────────────────────────────────────
  function getCurrentIssue() {
    try {
      var s = sessionStorage.getItem('KAHANI_CURRENT_ISSUE');
      if (s) return JSON.parse(s);
    } catch (e) { console.warn('[FtK] sessionStorage error', e); }
    return window.STORY_HOME_CONFIG || window.KAHANI_CURRENT_ISSUE || null;
  }
  function getIssueData()   { var i = getCurrentIssue() || {}; return i.fillTheKahani || {}; }
  function getStoryLines()  { var i = getCurrentIssue() || {}; return Array.isArray((i.story||{}).lines) ? i.story.lines : []; }

  // ── Word utilities ────────────────────────────────────────────────────────
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function tokenize(text) {
    return text.split(/\s+/).map(function (t) {
      return t.replace(/[“”"",،.؟?!।:;"'"'()\[\]\-]/g, '');
    }).filter(function (t) { return t.length > 0; });
  }

  function isContent(tok) { return tok.length > 2 && !STOP[tok.toLowerCase()]; }

  function buildWordPool(lines) {
    var seen = {}, pool = [];
    lines.forEach(function (line) {
      tokenize(line.romanUrdu).forEach(function (t) {
        var lw = t.toLowerCase();
        if (isContent(t) && !seen[lw]) { seen[lw] = true; pool.push(t); }
      });
    });
    return pool;
  }

  // Build roman → urdu token map from position alignment across all lines
  function buildRomanUrduMap(lines) {
    var map = {};
    lines.forEach(function (line) {
      var rToks = tokenize(line.romanUrdu);
      var uToks = line.urdu.split(/\s+/).map(function (t) {
        return t.replace(/[,،.؟?!।:;"'"']/g, '');
      });
      rToks.forEach(function (rt, i) {
        var lw = rt.toLowerCase();
        if (!map[lw] && i < uToks.length && uToks[i].length > 0) {
          map[lw] = uToks[i];
        }
      });
    });
    return map;
  }

  function blankIn(text, word) {
    var esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var out = text.replace(new RegExp('\\b' + esc + '\\b', 'i'), '___');
    if (out === text) {
      var idx = text.toLowerCase().indexOf(word.toLowerCase());
      if (idx !== -1) out = text.slice(0, idx) + '___' + text.slice(idx + word.length);
    }
    return out;
  }

  function blankUrduToken(text, token) {
    if (!token) return text;
    var idx = text.indexOf(token);
    return idx !== -1 ? text.slice(0, idx) + '___' + text.slice(idx + token.length) : text;
  }

  // Generate one slot from a story line
  function generateSlot(line, romanUrduMap) {
    var rToks = tokenize(line.romanUrdu);
    var cands = rToks.map(function (t, i) { return { t: t, i: i }; })
                     .filter(function (x) { return isContent(x.t); });
    if (!cands.length) return null;

    var best      = cands.reduce(function (a, b) { return b.t.length > a.t.length ? b : a; });
    var rWord     = best.t;
    var rIdx      = best.i;
    var blankedR  = blankIn(line.romanUrdu, rWord);
    if (blankedR === line.romanUrdu) return null;

    // Urdu: find token at same index position
    var uWords    = line.urdu.split(/\s+/);
    var uIdx      = Math.min(rIdx, uWords.length - 1);
    var uRaw      = uWords[uIdx] || '';
    var uTok      = uRaw.replace(/[,،.؟?!।:;"'"']/g, '');
    var blankedU  = uTok ? blankUrduToken(line.urdu, uTok) : line.urdu;
    var ansUrdu   = romanUrduMap[rWord.toLowerCase()] || uTok || '';

    return {
      lineId:             line.id,
      romanUrdu:          blankedR,
      urdu:               blankedU,
      english:            line.english,
      completedRomanUrdu: line.romanUrdu,
      completedUrdu:      line.urdu,
      completedEnglish:   line.english,
      answer:             rWord.toLowerCase(),
      answerRomanUrdu:    rWord,
      answerUrdu:         ansUrdu,
      filled:             false
    };
  }

  // Build all rounds for a given level
  function generateRounds(allLines, level) {
    var cfg    = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    var ruMap  = buildRomanUrduMap(allLines);
    var pool   = buildWordPool(allLines);
    var lines  = cfg.storyOrder ? allLines.slice() : shuffle(allLines.slice());

    // Build slots, skipping un-blankable lines
    var slots = [];
    lines.forEach(function (line) {
      var s = generateSlot(line, ruMap);
      if (s) slots.push(s);
    });

    var n      = cfg.linesPerRound;
    var rounds = [];

    for (var i = 0; i < slots.length; i += n) {
      var chunk = slots.slice(i, i + n);
      if (!chunk.length) continue;

      var correctValues  = chunk.map(function (s) { return s.answer; });
      var correctChoices = chunk.map(function (s) {
        return { value: s.answer, romanUrdu: s.answerRomanUrdu, urdu: s.answerUrdu };
      });

      var distractors = shuffle(
        pool.filter(function (w) { return correctValues.indexOf(w.toLowerCase()) === -1; })
      ).slice(0, Math.max(0, cfg.bankSize - chunk.length)).map(function (w) {
        return { value: w.toLowerCase(), romanUrdu: w, urdu: ruMap[w.toLowerCase()] || '' };
      });

      rounds.push({
        slots:       chunk.map(function (s) {
          // fresh copy so replay resets correctly
          return Object.assign({}, s, { filled: false });
        }),
        choices:     shuffle(correctChoices.concat(distractors)),
        usedChoices: new Set()
      });
    }

    return rounds;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var state = {
    selectedLevel: 1,
    showRoman:     true,
    showUrdu:      true,
    showEnglish:   false,
    selectedChip:  null,
    rounds:        [],
    roundIndex:    0,
    phase:         'question',
    totalLines:    0
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function getLevelLabel(n) { return (LEVEL_CONFIG[n] || {}).label || 'Level ' + n; }
  function getTalkPrompt(ri) {
    var r = state.rounds[ri];
    return (r && r.slots[0] && r.slots[0].talkAboutIt) ||
           genericTalkPrompts[ri % genericTalkPrompts.length];
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────
  // Render a sentence text (may contain ___) with either empty or filled blank span
  function renderBlanked(text, filledWord, slotIdx, isUrdu) {
    if (!text.includes('___')) return escapeHtml(text);
    var parts = text.split('___');
    var html  = '';
    for (var i = 0; i < parts.length; i++) {
      html += escapeHtml(parts[i]);
      if (i < parts.length - 1) {
        if (filledWord != null) {
          html += '<span class="ftk-blank ftk-blank--filled' +
                  (isUrdu ? ' ftk-blank--urdu' : '') + '">' +
                  escapeHtml(filledWord) + '</span>';
        } else {
          html += '<span class="ftk-blank ftk-blank--empty"' +
                  ' data-slot-index="' + slotIdx + '"' +
                  ' aria-label="blank"></span>';
        }
      }
    }
    return html;
  }

  function buildSlotInner(slot, slotIdx) {
    var html = '';
    var fR   = slot.filled ? slot.answerRomanUrdu : null;
    var fU   = slot.filled ? slot.answerUrdu      : null;

    if (state.showRoman) {
      html += '<div class="ftk-sentence-line roman-text" dir="ltr">' +
               renderBlanked(slot.romanUrdu, fR, slotIdx, false) + '</div>';
    }
    if (state.showUrdu) {
      var hasUrduBlank = slot.urdu.includes('___');
      if (hasUrduBlank) {
        html += '<div class="ftk-sentence-line urdu-text" dir="rtl">' +
                 renderBlanked(slot.urdu, fU, slotIdx, true) + '</div>';
      } else {
        html += '<div class="ftk-sentence-line urdu-text" dir="rtl">' +
                 escapeHtml(slot.urdu) + '</div>';
      }
    }
    // English hint — always in DOM, shown/hidden by hint button
    html += '<div class="ftk-slot-english" id="ftk-slot-eng-' + slotIdx + '"' +
            (state.showEnglish ? '' : ' style="display:none"') + '>' +
            escapeHtml(slot.completedEnglish) + '</div>';
    return html;
  }

  // Full round HTML: all slots with separators
  function buildRoundHTML(round) {
    var html = '';
    round.slots.forEach(function (slot, i) {
      html += '<div class="ftk-slot" id="ftk-slot-' + i + '" data-slot-index="' + i + '">';
      html += buildSlotInner(slot, i);
      html += '</div>';
    });
    return html;
  }

  function buildCompletedRoundHTML(round) {
    var html = '';
    round.slots.forEach(function (slot, i) {
      if (i > 0) html += '<hr class="ftk-slot-sep">';
      if (state.showRoman) {
        html += '<div class="ftk-completed-line roman-text" dir="ltr">' +
                 escapeHtml(slot.completedRomanUrdu) + '</div>';
      }
      if (state.showUrdu) {
        html += '<div class="ftk-completed-line urdu-text" dir="rtl">' +
                 escapeHtml(slot.completedUrdu) + '</div>';
      }
      if (state.showEnglish) {
        html += '<div class="ftk-completed-line english-text" dir="ltr">' +
                 escapeHtml(slot.completedEnglish) + '</div>';
      }
    });
    return html;
  }

  function buildTalkPromptHTML(p) {
    var html = '';
    if (state.showRoman) html += '<div class="talk-roman">' + escapeHtml(p.romanUrdu) + '</div>';
    if (state.showUrdu)  html += '<div class="talk-urdu" dir="rtl">' + escapeHtml(p.urdu) + '</div>';
    if (state.showEnglish) html += '<div class="talk-english">' + escapeHtml(p.english) + '</div>';
    return html;
  }

  function renderWordBank(round) {
    cleanupDrag();
    state.selectedChip = null;
    els.choices.innerHTML = '';
    els.choices.className = 'ftk-choices ftk-choices--chips';
    var bilingual = state.showRoman && state.showUrdu;
    var urduOnly  = !state.showRoman && state.showUrdu;

    round.choices.forEach(function (choice, idx) {
      var chip = document.createElement('button');
      chip.type      = 'button';
      chip.className = 'word-chip' + (bilingual && choice.urdu ? ' word-chip--bilingual' : '');
      chip.setAttribute('data-index', String(idx));
      chip.setAttribute('data-value', choice.value);

      if (bilingual && choice.urdu) {
        var rs = document.createElement('span'); rs.className = 'chip-roman'; rs.textContent = choice.romanUrdu;
        var us = document.createElement('span'); us.className = 'chip-urdu';  us.textContent = choice.urdu; us.dir = 'rtl';
        chip.appendChild(rs); chip.appendChild(us);
        chip.setAttribute('aria-label', choice.romanUrdu + ' / ' + choice.urdu);
      } else if (urduOnly) {
        chip.textContent = choice.urdu || choice.romanUrdu;
        chip.dir = 'rtl';
        chip.setAttribute('aria-label', choice.urdu || choice.romanUrdu);
      } else {
        chip.textContent = choice.romanUrdu;
        chip.setAttribute('aria-label', choice.romanUrdu);
      }

      if (round.usedChoices.has(choice.value)) {
        chip.disabled = true;
        chip.classList.add('used');
      }
      els.choices.appendChild(chip);
    });

    initInteraction();
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var els = {};
  function initRefs() {
    els.gearBtn         = document.getElementById('ftk-gear-btn');
    els.settingsOverlay = document.getElementById('ftk-settings-overlay');
    els.settingsDrawer  = document.getElementById('ftk-settings-drawer');
    els.settingsClose   = document.getElementById('ftk-settings-close');
    els.difficultyPills = document.getElementById('difficulty-pills');
    els.langPills       = document.getElementById('lang-pills');
    els.settingsChip    = document.getElementById('ftk-settings-chip');
    els.hintBtn         = document.getElementById('ftk-hint-btn');
    els.game            = document.getElementById('ftk-game');
    els.progressFill    = document.getElementById('ftk-progress-fill');
    els.progressText    = document.getElementById('ftk-progress-text');
    els.levelBadge      = document.getElementById('ftk-level-badge');
    els.sentence        = document.getElementById('ftk-sentence');
    els.choices         = document.getElementById('ftk-choices');
    els.resetBtn        = document.getElementById('ftk-reset-btn');
    els.feedback        = document.getElementById('ftk-feedback');
    els.completed       = document.getElementById('ftk-completed');
    els.completedSent   = document.getElementById('ftk-completed-sentence');
    els.talkPrompt      = document.getElementById('ftk-talk-prompt');
    els.nextBtn         = document.getElementById('ftk-next-btn');
    els.noQuestions     = document.getElementById('ftk-no-questions');
    els.gotoL1Btn       = document.getElementById('ftk-goto-l1-btn');
    els.emptyState      = document.getElementById('ftk-empty-state');
    els.completion      = document.getElementById('ftk-completion');
    els.compScore       = document.getElementById('ftk-completion-score');
    els.replayBtn       = document.getElementById('ftk-replay-btn');
    els.changeLevelBtn  = document.getElementById('ftk-change-level-btn');
  }

  // ── Issue metadata ────────────────────────────────────────────────────────
  function applyIssueMetadata() {
    var d = getIssueData();
    var t = document.getElementById('ftk-page-title');
    if (t && d.title) { t.textContent = d.title; document.title = d.title + ' | Kahani Korner'; }
  }

  // ── Settings drawer ───────────────────────────────────────────────────────
  function openSettings() {
    els.settingsDrawer.classList.add('open');
    els.settingsOverlay.classList.add('open');
    els.settingsDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeSettings() {
    els.settingsDrawer.classList.remove('open');
    els.settingsOverlay.classList.remove('open');
    els.settingsDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function renderDifficultyPills() {
    els.difficultyPills.innerHTML = '';
    Object.keys(LEVEL_CONFIG).forEach(function (k) {
      var lv  = parseInt(k, 10);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ftk-spill' + (lv === state.selectedLevel ? ' ftk-spill--active' : '');
      btn.setAttribute('data-level', String(lv));
      btn.textContent = LEVEL_CONFIG[lv].label;
      btn.addEventListener('click', function () { selectLevel(lv); closeSettings(); });
      els.difficultyPills.appendChild(btn);
    });
  }
  function updateDifficultyPills() {
    els.difficultyPills.querySelectorAll('.ftk-spill').forEach(function (b) {
      b.classList.toggle('ftk-spill--active', parseInt(b.getAttribute('data-level'), 10) === state.selectedLevel);
    });
  }

  function showLangWarning() {
    var w = document.getElementById('ftk-lang-warning');
    if (!w) {
      w = document.createElement('p');
      w.id = 'ftk-lang-warning';
      w.className = 'ftk-lang-warning';
      w.textContent = 'Please keep at least one language on.';
      els.langPills.parentNode.appendChild(w);
    }
    w.style.display = 'block';
    clearTimeout(w._t);
    w._t = setTimeout(function () { w.style.display = 'none'; }, 2200);
  }

  function rerenderCurrentRound() {
    var round = state.rounds[state.roundIndex];
    if (round && state.phase === 'question') {
      els.sentence.innerHTML = buildRoundHTML(round);
      renderWordBank(round);
    }
  }

  function renderLangPills() {
    els.langPills.innerHTML = '';
    var defs = [
      { key: 'roman', label: 'Roman Urdu' },
      { key: 'urdu',  label: 'Urdu' }
    ];
    defs.forEach(function (d) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var isActive = d.key === 'roman' ? state.showRoman : state.showUrdu;
      btn.className = 'ftk-spill' + (isActive ? ' ftk-spill--active' : '');
      btn.setAttribute('data-lang-toggle', d.key);
      btn.textContent = d.label;
      btn.addEventListener('click', function () {
        var isOn    = d.key === 'roman' ? state.showRoman : state.showUrdu;
        var otherOn = d.key === 'roman' ? state.showUrdu  : state.showRoman;
        if (isOn && !otherOn) { showLangWarning(); return; }
        if (d.key === 'roman') state.showRoman = !state.showRoman;
        else                   state.showUrdu  = !state.showUrdu;
        updateLangPills();
        updateSettingsSummary();
        rerenderCurrentRound();
      });
      els.langPills.appendChild(btn);
    });
  }

  function updateLangPills() {
    els.langPills.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
      var k = b.getAttribute('data-lang-toggle');
      b.classList.toggle('ftk-spill--active', k === 'roman' ? state.showRoman : state.showUrdu);
    });
  }

  function updateSettingsSummary() {
    var ll = state.showRoman && state.showUrdu ? 'Roman + Urdu'
           : state.showRoman ? 'Roman Urdu'
           : 'Urdu';
    if (els.settingsChip) els.settingsChip.textContent = getLevelLabel(state.selectedLevel) + ' • ' + ll;
    if (els.levelBadge)   els.levelBadge.textContent   = getLevelLabel(state.selectedLevel);
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  function showEmptyState(title, msg) {
    var te = els.emptyState && els.emptyState.querySelector('.ftk-empty-title');
    var me = els.emptyState && els.emptyState.querySelector('.ftk-empty-text');
    if (te && title) te.textContent = title;
    if (me && msg)   me.innerHTML   = msg;
    if (els.emptyState) els.emptyState.style.display = 'block';
    if (els.game)       els.game.style.display       = 'none';
    if (els.completion) els.completion.style.display = 'none';
  }

  // ── Level & hint ──────────────────────────────────────────────────────────
  function selectLevel(lv) {
    state.selectedLevel = lv;
    updateDifficultyPills();
    updateSettingsSummary();
    startGame();
  }

  function toggleHint() {
    state.showEnglish = !state.showEnglish;
    if (els.hintBtn) {
      els.hintBtn.classList.toggle('ftk-hint-btn--active', state.showEnglish);
      els.hintBtn.textContent = state.showEnglish ? '💡 Hide English' : '💡 Hint: English';
    }
    // Show/hide slot english divs without re-rendering
    var round = state.rounds[state.roundIndex];
    if (round) {
      round.slots.forEach(function (_, i) {
        var el = document.getElementById('ftk-slot-eng-' + i);
        if (el) el.style.display = state.showEnglish ? '' : 'none';
      });
    }
    // Update completed panel too if visible
    if (state.phase !== 'question') {
      var r = state.rounds[state.roundIndex];
      if (r && els.completedSent) els.completedSent.innerHTML = buildCompletedRoundHTML(r);
    }
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  function updateProgress() {
    var rounds = state.rounds;
    var ri     = state.roundIndex;
    var total  = state.totalLines;
    var n      = (LEVEL_CONFIG[state.selectedLevel] || LEVEL_CONFIG[1]).linesPerRound;

    var lineStart = ri * n + 1;
    var lineEnd   = Math.min((ri + 1) * n, total);
    var pct       = rounds.length > 0 ? (ri / rounds.length) * 100 : 0;

    if (els.progressFill) els.progressFill.style.width = pct + '%';
    if (els.progressText) {
      els.progressText.textContent = n === 1
        ? 'Line ' + lineStart + ' of ' + total
        : 'Lines ' + lineStart + '–' + lineEnd + ' of ' + total;
    }
  }

  // ── Round rendering ───────────────────────────────────────────────────────
  function renderRound() {
    var round = state.rounds[state.roundIndex];
    if (!round) { showCompletion(); return; }

    state.phase        = 'question';
    state.selectedChip = null;

    els.completed.style.display   = 'none';
    els.feedback.style.display    = 'none';
    els.noQuestions.style.display = 'none';

    updateProgress();
    if (els.levelBadge) els.levelBadge.textContent = getLevelLabel(state.selectedLevel);
    els.sentence.innerHTML = buildRoundHTML(round);
    renderWordBank(round);
    if (els.resetBtn) els.resetBtn.style.display = 'inline-flex';
  }

  // Refresh a single slot in place after correct answer
  function refreshSlot(slotIdx) {
    var round  = state.rounds[state.roundIndex];
    var slot   = round && round.slots[slotIdx];
    var slotEl = document.getElementById('ftk-slot-' + slotIdx);
    if (slotEl && slot) slotEl.innerHTML = buildSlotInner(slot, slotIdx);
  }

  function initInteraction() {

    function positionGhost(x, y) {
      if (!_drag.ghost) return;
      _drag.ghost.style.left = (x - (_drag.ghost.offsetWidth  || 80) / 2) + 'px';
      _drag.ghost.style.top  = (y - (_drag.ghost.offsetHeight || 44) / 2) + 'px';
    }

    function getBlankUnder(x, y) {
      if (_drag.ghost) _drag.ghost.style.display = 'none';
      var el = document.elementFromPoint(x, y);
      if (_drag.ghost) _drag.ghost.style.display = '';
      while (el && el !== document.body) {
        if (el.classList && el.classList.contains('ftk-blank--empty')) return el;
        el = el.parentElement;
      }
      return null;
    }

    els.choices.querySelectorAll('.word-chip:not(.used)').forEach(function (chip) {

      chip.addEventListener('pointerdown', function (e) {
        if (chip.disabled || chip.classList.contains('used')) return;
        e.preventDefault();
        cleanupDrag();
        clearChipSelection();
        _drag.chip  = chip;
        _drag.sx    = e.clientX;
        _drag.sy    = e.clientY;
        _drag.moved = false;
        chip.setPointerCapture(e.pointerId);
        chip.classList.add('dragging');
        _drag.ghost = document.createElement('div');
        _drag.ghost.className = 'word-chip word-chip--ghost' +
                                (chip.classList.contains('word-chip--bilingual') ? ' word-chip--bilingual' : '');
        _drag.ghost.innerHTML = chip.innerHTML || escapeHtml(chip.textContent);
        document.body.appendChild(_drag.ghost);
        positionGhost(e.clientX, e.clientY);
      });

      chip.addEventListener('pointermove', function (e) {
        if (!_drag.chip || _drag.chip !== chip) return;
        e.preventDefault();
        positionGhost(e.clientX, e.clientY);
        if (Math.abs(e.clientX - _drag.sx) > 6 || Math.abs(e.clientY - _drag.sy) > 6) _drag.moved = true;
        document.querySelectorAll('.ftk-blank--over').forEach(function (b) { b.classList.remove('ftk-blank--over'); });
        var blank = getBlankUnder(e.clientX, e.clientY);
        if (blank) blank.classList.add('ftk-blank--over');
      });

      chip.addEventListener('pointerup', function (e) {
        if (!_drag.chip || _drag.chip !== chip) return;
        var wasMoved = _drag.moved;
        document.querySelectorAll('.ftk-blank--over').forEach(function (b) { b.classList.remove('ftk-blank--over'); });
        var blank = getBlankUnder(e.clientX, e.clientY);
        cleanupDrag();

        if (wasMoved && blank) {
          attemptDrop(chip, parseInt(blank.getAttribute('data-slot-index'), 10));
        } else if (!wasMoved) {
          if (state.selectedChip === chip) {
            clearChipSelection();
          } else {
            clearChipSelection();
            chip.classList.add('ftk-chip--selected');
            state.selectedChip = chip;
          }
        }
      });

      chip.addEventListener('pointercancel', cleanupDrag);
    });
  }

  function clearChipSelection() {
    if (state.selectedChip) {
      state.selectedChip.classList.remove('ftk-chip--selected');
      state.selectedChip = null;
    }
  }

  // ── Drop logic ────────────────────────────────────────────────────────────
  function attemptDrop(chip, slotIdx) {
    if (state.phase !== 'question') return;
    var round = state.rounds[state.roundIndex];
    if (!round || slotIdx < 0 || slotIdx >= round.slots.length) return;
    var slot  = round.slots[slotIdx];
    if (slot.filled) return;

    var value = chip.getAttribute('data-value');

    if (value === slot.answer) {
      // ── CORRECT ──
      slot.filled = true;
      round.usedChoices.add(value);
      chip.disabled = true;
      chip.classList.add('used');
      clearChipSelection();

      refreshSlot(slotIdx);

      // Bounce animation on filled blank
      setTimeout(function () {
        var fb = document.querySelector('#ftk-slot-' + slotIdx + ' .ftk-blank--filled');
        if (fb) {
          fb.classList.add('ftk-blank--bounce');
          setTimeout(function () { fb && fb.classList.remove('ftk-blank--bounce'); }, 500);
        }
      }, 30);

      // Check if all slots filled
      if (round.slots.every(function (s) { return s.filled; })) {
        setTimeout(onRoundComplete, 600);
      }
    } else {
      // ── INCORRECT ──
      var targetBlank = document.querySelector('#ftk-slot-' + slotIdx + ' .ftk-blank--empty');
      if (targetBlank) {
        targetBlank.classList.add('ftk-blank--shake');
        setTimeout(function () { if (targetBlank) targetBlank.classList.remove('ftk-blank--shake'); }, 400);
      }
      clearChipSelection();
      showIncorrectFeedback();
    }
  }

  function onRoundComplete() {
    state.phase = 'correct';
    var round   = state.rounds[state.roundIndex];
    var prompt  = getTalkPrompt(state.roundIndex);
    els.completedSent.innerHTML = buildCompletedRoundHTML(round);
    els.talkPrompt.innerHTML    = buildTalkPromptHTML(prompt);
    els.completed.style.display = 'block';
    setTimeout(function () { els.completed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────
  var incorrectMessages = ['Try again!', 'Almost! Try one more time.', 'Not quite — give it another go!'];
  var incorrectIdx = 0;

  function showIncorrectFeedback() {
    var msg = incorrectMessages[incorrectIdx % incorrectMessages.length];
    incorrectIdx++;
    els.feedback.className = 'ftk-feedback ftk-feedback--incorrect';
    els.feedback.innerHTML = '<span class="ftk-feedback-icon">↺</span><span>' + escapeHtml(msg) + '</span>';
    els.feedback.style.display = 'flex';
    setTimeout(function () { if (els.feedback) els.feedback.style.display = 'none'; }, 1500);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function goNext() {
    state.roundIndex++;
    if (state.roundIndex >= state.rounds.length) {
      showCompletion();
    } else {
      renderRound();
      els.game.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showCompletion() {
    state.phase = 'complete';
    els.game.style.display       = 'none';
    els.completion.style.display = 'block';
    var total = state.rounds.length;
    if (els.compScore) els.compScore.textContent = 'You completed all ' + total + ' round' + (total !== 1 ? 's' : '') + '!';
    els.completion.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function replayLevel() {
    state.roundIndex = 0;
    els.completion.style.display = 'none';
    els.game.style.display       = 'block';
    startGame();
  }

  function showLevelChooser() {
    els.completion.style.display = 'none';
    els.game.style.display       = 'block';
    openSettings();
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function attachEvents() {
    els.gearBtn.addEventListener('click', openSettings);
    els.settingsOverlay.addEventListener('click', closeSettings);
    els.settingsClose.addEventListener('click', closeSettings);
    if (els.settingsChip) els.settingsChip.addEventListener('click', openSettings);
    if (els.hintBtn) els.hintBtn.addEventListener('click', toggleHint);

    // Sentence click delegation: tap-then-tap to place word into blank
    els.sentence.addEventListener('click', function (e) {
      if (state.phase !== 'question') return;
      var el = e.target;
      while (el && el !== els.sentence) {
        if (el.classList && el.classList.contains('ftk-blank--empty')) break;
        el = el.parentElement;
      }
      if (el && el.classList && el.classList.contains('ftk-blank--empty') && state.selectedChip) {
        attemptDrop(state.selectedChip, parseInt(el.getAttribute('data-slot-index'), 10));
      }
    });

    els.resetBtn.addEventListener('click', function () {
      if (state.phase !== 'question') return;
      var round = state.rounds[state.roundIndex];
      if (!round) return;
      round.slots.forEach(function (s) { s.filled = false; });
      round.usedChoices = new Set();
      state.selectedChip = null;
      els.feedback.style.display = 'none';
      els.sentence.innerHTML     = buildRoundHTML(round);
      renderWordBank(round);
    });

    els.nextBtn.addEventListener('click', goNext);
    els.replayBtn.addEventListener('click', replayLevel);
    els.changeLevelBtn.addEventListener('click', showLevelChooser);
    els.gotoL1Btn.addEventListener('click', function () { selectLevel(1); });

    // Global drag cleanup: Escape key and window losing focus
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { cleanupDrag(); clearChipSelection(); }
    });
    window.addEventListener('blur', cleanupDrag);
  }

  // ── Start game ────────────────────────────────────────────────────────────
  function startGame() {
    var lines   = getStoryLines();
    state.totalLines  = lines.length;
    state.rounds      = generateRounds(lines, state.selectedLevel);
    state.roundIndex  = 0;
    state.phase       = 'question';
    state.selectedChip = null;

    els.completion.style.display = 'none';
    els.game.style.display       = 'block';
    renderRound();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    initRefs();
    var issue = getCurrentIssue();
    if (!issue) {
      showEmptyState('No Story Data Found', 'No story data was found.<br>Please open this game from the newspaper page.');
      return;
    }
    var lines = getStoryLines();
    if (lines.length === 0) {
      showEmptyState('Coming Soon!', 'This issue\'s story hasn\'t been added yet.<br>Check back soon!');
      return;
    }
    applyIssueMetadata();
    renderDifficultyPills();
    renderLangPills();
    updateSettingsSummary();
    attachEvents();
    startGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
