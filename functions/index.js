const functions = require("firebase-functions");
const stripe = require("stripe");
const OpenAI = require("openai");

exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
  // Allow CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const key = process.env.STRIPE_SECRET_KEY || "";
  console.log("Stripe key prefix:", key.substring(0, 12));

  if (!key) {
    res.status(500).json({ error: "Stripe key not configured" });
    return;
  }

  try {
    const stripeClient = stripe(key);
    const { items } = req.body;

    if (!items || items.length === 0) {
      res.status(400).json({ error: "No items in cart" });
      return;
    }

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: items,
      mode: "payment",
      success_url: "https://kahanikorner.com/success.html",
      cancel_url: "https://kahanikorner.com/products.html",
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// generateSentence — AI-powered fill-in-the-blank sentence generator
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by the fill-in-the-blank game frontend at POST /api/generate-sentence
// (rewritten to this function via firebase.json hosting rewrites).
//
// Store the key with:
//   firebase functions:secrets:set OPENAI_API_KEY
// Then grant access:
//   firebase deploy --only functions
//
// ─────────────────────────────────────────────────────────────────────────────

// System prompt — instructs the model to return JSON only, follow the schema,
// and keep sentences child-friendly and linguistically natural.
const SENTENCE_SYSTEM_PROMPT = `\
You are a bilingual Urdu–English language learning assistant for children and beginner learners.

Your ONLY job is to create fill-in-the-blank sentences for vocabulary practice.

STRICT RULES:
1. Respond with ONLY valid JSON — no markdown, no code fences, no explanation, no commentary.
2. Use the target word naturally in the sentence, exactly once if possible.
3. Replace the target word with exactly "_____" (5 underscores) in both blank versions.
4. Keep Roman Urdu (romanFull / romanBlank) phonetically aligned with the Urdu script sentence.
5. The English translation must be natural — not word-for-word literal.
6. Sentences must be child-friendly, encouraging, and culturally appropriate for a South Asian audience.
7. Hard difficulty may use a grammatical variant of the word (e.g. plural, case form) if it sounds natural.

DIFFICULTY GUIDELINES:
  easy   — 5–8 Urdu words, very simple, direct use of base form
  medium — 8–12 Urdu words, slightly richer context, still beginner-accessible
  hard   — 12–18 Urdu words, fuller sentence with context, variant form acceptable

REQUIRED JSON SCHEMA (return exactly these fields, nothing else):
{
  "level": "easy | medium | hard",
  "urduFull":           "complete Urdu sentence including the target word",
  "urduBlank":          "same Urdu sentence with _____ replacing the target word",
  "romanFull":          "complete Roman Urdu transliteration",
  "romanBlank":         "same Roman Urdu with _____ replacing the target word",
  "englishTranslation": "natural English translation of the full sentence",
  "answerUrdu":         "the exact token that was blanked — in Urdu script",
  "answerRoman":        "the exact token that was blanked — in Roman Urdu"
}`;

// Builds the per-request user prompt.
// To change how sentences are generated, edit only this function.
function buildSentencePrompt(word, difficulty) {
  const variantLines =
    Array.isArray(word.variants) && word.variants.length > 0
      ? "\nGrammatical variants (use only if natural for the difficulty):\n" +
        word.variants
          .map((v) => `  - Urdu: "${v.urdu}"  Roman: "${v.romanUrdu}"`)
          .join("\n")
      : "";

  return (
    `Generate a fill-in-the-blank sentence for the vocabulary word below.\n\n` +
    `Target word:\n` +
    `  Urdu script   : "${word.urdu}"\n` +
    `  Roman Urdu    : "${word.romanUrdu}"\n` +
    `  English       : "${word.english}"\n` +
    `  Part of speech: ${word.pos || "unknown"}\n` +
    `  Gender        : ${word.gender || "unknown"}` +
    variantLines +
    `\n\nDifficulty: ${difficulty}\n\nReturn only the JSON object.`
  );
}

// Strip markdown code fences in case the model wraps its response.
function stripFences(raw) {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

// Validate all required fields exist and blanks are actually blanked.
function validateSentence(obj) {
  const required = [
    "level", "urduFull", "urduBlank", "romanFull",
    "romanBlank", "englishTranslation", "answerUrdu", "answerRoman",
  ];
  for (const key of required) {
    if (typeof obj[key] !== "string" || obj[key].trim() === "") {
      throw new Error(`AI response missing field: "${key}"`);
    }
  }
  if (!obj.urduBlank.includes("_____")) {
    throw new Error(`urduBlank is missing the _____ placeholder`);
  }
  if (!obj.romanBlank.includes("_____")) {
    throw new Error(`romanBlank is missing the _____ placeholder`);
  }
}

exports.generateSentence = functions
  .runWith({ secrets: ["OPENAI_API_KEY"] })
  .https.onRequest(async (req, res) => {
    // CORS — same pattern as createCheckoutSession
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method Not Allowed" });
      return;
    }

    // ── Validate API key ───────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      console.error("[generateSentence] OPENAI_API_KEY secret is not set.");
      res.status(500).json({ success: false, error: "AI service is not configured." });
      return;
    }

    // ── Validate request body ──────────────────────────────────────────────
    const { word, difficulty } = req.body || {};

    if (!word || typeof word !== "object") {
      res.status(400).json({ success: false, error: 'Request body must include a "word" object.' });
      return;
    }

    const missing = ["urdu", "romanUrdu", "english"].filter(
      (k) => !word[k] || typeof word[k] !== "string"
    );
    if (missing.length) {
      res.status(400).json({
        success: false,
        error: `"word" is missing required fields: ${missing.join(", ")}`,
      });
      return;
    }

    const level = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "easy";

    // ── Call OpenAI ────────────────────────────────────────────────────────
    const openai = new OpenAI({ apiKey });
    let rawContent = "";

    try {
      const completion = await openai.chat.completions.create({
        model:       "gpt-4o-mini",
        messages: [
          { role: "system", content: SENTENCE_SYSTEM_PROMPT },
          { role: "user",   content: buildSentencePrompt(word, level) },
        ],
        temperature: 0.7,
        max_tokens:  400,
      });
      rawContent = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("[generateSentence] OpenAI error:", err.message);
      res.status(502).json({
        success: false,
        error: "Could not reach the AI service. Please try again.",
      });
      return;
    }

    // ── Parse & validate ───────────────────────────────────────────────────
    try {
      const parsed = JSON.parse(stripFences(rawContent));
      validateSentence(parsed);
      parsed.level = level;

      console.log(`[generateSentence] ✓  word="${word.romanUrdu}"  difficulty=${level}`);
      res.status(200).json({ success: true, sentence: parsed });
    } catch (err) {
      console.error("[generateSentence] Parse error:", err.message);
      console.error("[generateSentence] Raw output:", rawContent);
      res.status(502).json({
        success: false,
        error: "The AI returned an unexpected response. Please try again.",
      });
    }
  });