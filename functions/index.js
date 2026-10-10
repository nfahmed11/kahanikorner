// 1st-gen API: these functions were created as 1st gen and must stay that way
// (moving to 2nd gen means deleting and recreating them).
const functions = require("firebase-functions/v1");
const stripe = require("stripe");
const OpenAI = require("openai");

// ─────────────────────────────────────────────────────────────────────────────
// Archive availability — server-side source of truth for which months can be
// purchased. Derived from today's date with the same rules as
// buildArchiveAvailability() in subscribe.html, so a new month opens on both
// sides at once with no manual update. Keep ARCHIVE_START_* and
// ARCHIVE_SOLD_OUT in sync with subscribe.html.
// true = available, false = sold out / not yet released (both are rejected).
// ─────────────────────────────────────────────────────────────────────────────
const ARCHIVE_START_YEAR = 2025;
const ARCHIVE_START_MONTH = 10; // November (0-indexed)

// year → array of 0-indexed months that are sold out.
const ARCHIVE_SOLD_OUT = {
  // 2025: [0, 1], // e.g. Jan and Feb 2025 sold out
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Uses the date in the earliest time zone (UTC+14), so a customer whose
// calendar has already rolled over to a new month is never rejected.
function getArchiveAvailability(now = new Date()) {
  const ahead = new Date(now.getTime() + 14 * 60 * 60 * 1000);
  const currentYear = ahead.getUTCFullYear();
  const currentMonth = ahead.getUTCMonth();
  const availability = {};

  for (let year = ARCHIVE_START_YEAR; year <= currentYear; year++) {
    const soldOut = new Set(ARCHIVE_SOLD_OUT[year] || []);
    const months = {};
    MONTH_NAMES.forEach((name, i) => {
      const beforeStart = year === ARCHIVE_START_YEAR && i < ARCHIVE_START_MONTH;
      const afterCurrent = year === currentYear && i > currentMonth;
      months[name] = !beforeStart && !afterCurrent && !soldOut.has(i);
    });
    availability[String(year)] = months;
  }

  return availability;
}


// ─────────────────────────────────────────────────────────────────────────────
// Checkout shipping (cart, Shop Buy Now, Archive Buy Now)
//   US:     sticker-only (flat) orders up to 6 oz: Untracked Letter Mail.
//           Everything else: fixed pound table (total weight rounded up to the
//           next whole pound, up to 70 lb). Free at $65.00+.
//   Canada / International: archive-only orders up to 3.5 oz: Untracked
//           International Letter Mail. Everything else: fixed tiers by total
//           product weight, up to 20 lb.
// Trusted product weights/classes and rate tables live in shipping.js; this
// file verifies prices and rates against Stripe and builds the Checkout
// Session. No shipping amount or weight from the browser is ever used.
// ─────────────────────────────────────────────────────────────────────────────

const {
  checkoutError,
  calculateShipmentProfile,
  getShippingOption,
  US_SHIPPING_COUNTRIES,
  CA_SHIPPING_COUNTRIES,
  INTL_SHIPPING_COUNTRIES,
} = require("./shipping");

// Abuse limits for the public checkout endpoints.
const MAX_REQUEST_BODY_CHARS = 32000;
const MAX_CART_LINES = 30;
const MAX_QUANTITY_PER_LINE = 50;

async function getTrustedSubtotalCents(stripeClient, lineItems) {
  const priceIds = [...new Set(lineItems.map((li) => li.price))];
  const prices = await Promise.all(
    priceIds.map((id) => stripeClient.prices.retrieve(id))
  );
  const priceById = new Map(prices.map((p) => [p.id, p]));

  let subtotal = 0;

  for (const li of lineItems) {
    const price = priceById.get(li.price);

    if (
      !price ||
      !price.active ||
      price.type !== "one_time" ||
      price.currency !== "usd" ||
      !Number.isInteger(price.unit_amount)
    ) {
      throw checkoutError(
        `Price ${li.price} is not available for checkout.`,
        400
      );
    }

    subtotal += price.unit_amount * li.quantity;
  }

  return subtotal;
}

function getAllowedCountries(region) {
  if (region === "US") return US_SHIPPING_COUNTRIES;
  return region === "CA" ? CA_SHIPPING_COUNTRIES : INTL_SHIPPING_COUNTRIES;
}

function parseShippingRegion(value) {
  return value === "CA" || value === "INTL" ? value : "US";
}

function isOversizedBody(body) {
  try {
    return JSON.stringify(body || {}).length > MAX_REQUEST_BODY_CHARS;
  } catch (_) {
    return true;
  }
}

// Validates one archive selection; returns its de-duplicated month names.
function validateArchiveSelection(year, months) {
  const yearAvailability = getArchiveAvailability()[year];
  if (!yearAvailability) {
    throw checkoutError(`Year ${year} is not available.`, 400);
  }

  const uniqueMonths = [...new Set(months)];
  for (const month of uniqueMonths) {
    if (typeof month !== "string" || !Object.prototype.hasOwnProperty.call(yearAvailability, month)) {
      throw checkoutError(`"${month}" is not a valid month name.`, 400);
    }
    if (!yearAvailability[month]) {
      throw checkoutError(`Archive item has unavailable month: ${month} ${year}.`, 400);
    }
  }
  return uniqueMonths;
}

// Raw cart items from the browser → trusted Stripe line items + order metadata.
// Only price IDs, quantities and archive selections are read; the browser's
// name / price / image fields are ignored.
function buildCartLineItems(cartItems, archivePriceId) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw checkoutError("No items in cart.", 400);
  }
  if (cartItems.length > MAX_CART_LINES) {
    throw checkoutError("Your cart has too many items for online checkout. Please contact us to place this order.", 400);
  }

  const lineItems = [];
  const metadata = {};

  // ── Regular products ──────────────────────────────────────────────────────
  const regularItems = cartItems.filter((item) => !item || item.productType !== "kahani_times_archive");
  for (const item of regularItems) {
    if (!item || !item.id || typeof item.id !== "string" || item.id.length > 100) {
      throw checkoutError(`Cart item "${(item && item.name) || "unknown"}" is missing a valid price ID.`, 400);
    }
    const quantity = item.quantity || 1;

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw checkoutError(`Cart item "${item.name || "unknown"}" has an invalid quantity.`, 400);
    }
    if (quantity > MAX_QUANTITY_PER_LINE) {
      throw checkoutError(`Cart item "${item.name || "unknown"}" quantity is too large for online checkout. Please contact us for bulk orders.`, 400);
    }

    lineItems.push({ price: item.id, quantity });
  }

  // ── Archive products ──────────────────────────────────────────────────────
  const archiveItems = cartItems.filter((item) => item && item.productType === "kahani_times_archive");
  if (archiveItems.length > 0) {
    if (!archivePriceId) {
      console.error("[checkout] STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID is not set.");
      throw checkoutError("Server configuration error: archive price ID is not configured.", 500);
    }

    let totalArchiveQty = 0;
    const archiveSummaries = [];

    for (const archiveItem of archiveItems) {
      const year   = String(archiveItem.selectedYear || "");
      const months = archiveItem.selectedMonths;

      if (!year) {
        throw checkoutError("Archive item missing selectedYear.", 400);
      }
      if (months === undefined || months === null) {
        throw checkoutError("Archive item missing selectedMonths.", 400);
      }
      if (!Array.isArray(months)) {
        throw checkoutError("Archive item selectedMonths must be an array.", 400);
      }
      if (months.length === 0) {
        throw checkoutError("Archive item selectedMonths must not be empty.", 400);
      }

      const uniqueMonths = validateArchiveSelection(year, months);

      totalArchiveQty += uniqueMonths.length;
      archiveSummaries.push({ year, months: uniqueMonths, count: uniqueMonths.length });
    }

    lineItems.push({ price: archivePriceId, quantity: totalArchiveQty });

    metadata.has_archive = "true";
    if (archiveSummaries.length === 1) {
      metadata.archive_selected_year   = archiveSummaries[0].year;
      metadata.archive_selected_months = archiveSummaries[0].months.join(", ");
      metadata.archive_selected_count  = String(archiveSummaries[0].count);
      metadata.archive_packaging       = "Bundled together in one clear protective plastic sleeve";
    } else {
      // Multiple archive years — compact to stay within Stripe's 500-char limit per value
      metadata.archive_items = archiveSummaries
        .map((s) => `${s.year}: ${s.months.join(", ")}`)
        .join(" | ")
        .substring(0, 500);
    }
  }

  return { lineItems, metadata };
}

// Shared by both checkout endpoints so every path prices shipping the same way.
async function resolveShipping(stripeClient, lineItems, region) {
  const subtotalCents =
    await getTrustedSubtotalCents(stripeClient, lineItems);

  const shipmentProfile = calculateShipmentProfile(
    lineItems,
    process.env.STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID || ""
  );

  const option = getShippingOption(shipmentProfile, region, subtotalCents);

  return { subtotalCents, shipmentProfile, option };
}

async function getVerifiedShippingRateId(stripeClient, rate) {
  const rateId = process.env[rate.env] || "";

  if (!rateId) {
    throw checkoutError(
      `Server configuration error: ${rate.env} is not set.`,
      500
    );
  }

  const shippingRate =
    await stripeClient.shippingRates.retrieve(rateId);

  const fixed = shippingRate.fixed_amount || {};

  if (
    !shippingRate.active ||
    shippingRate.type !== "fixed_amount" ||
    fixed.currency !== "usd" ||
    fixed.amount !== rate.amountCents
  ) {
    throw checkoutError(
      `Server configuration error: ${rate.env} (${rateId}) is not an active $${(
        rate.amountCents / 100
      ).toFixed(2)} USD fixed-amount rate.`,
      500
    );
  }

  return rateId;
}

// Pre-made Stripe rates (free US, Canada / International tiers) → verified
// shipping-rate ID. Pound-table and letter-mail amounts → shipping_rate_data
// built from the server's own trusted table.
async function toStripeShippingOption(stripeClient, option) {
  if (option.rate) {
    return { shipping_rate: await getVerifiedShippingRateId(stripeClient, option.rate) };
  }

  if (!Number.isInteger(option.amountCents) || option.amountCents < 0) {
    throw checkoutError(`Server error: invalid shipping amount for ${option.mode}.`, 500);
  }

  return {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: option.amountCents, currency: "usd" },
      display_name: option.displayName,
      metadata: { shipping_mode: option.mode },
    },
  };
}

async function buildCheckoutShipping(stripeClient, lineItems, region, logTag) {
  const { subtotalCents, shipmentProfile, option } =
    await resolveShipping(stripeClient, lineItems, region);

  const shippingOption = await toStripeShippingOption(stripeClient, option);
  const freeUsShipping = region === "US" && option.amountCents === 0;

  console.log(
    `[${logTag}] Shipping:`,
    JSON.stringify({
      region,
      subtotalCents,
      ...shipmentProfile,
      mode: option.mode,
      amountCents: option.amountCents,
      rate: option.rate ? option.rate.env : undefined,
      rateId: shippingOption.shipping_rate,
    })
  );

  const metadata = {
    shipping_region: region,
    merchandise_subtotal_cents: String(subtotalCents),
    free_us_shipping: String(freeUsShipping),
    shipment_weight_oz: String(shipmentProfile.totalWeightOz),
    shipment_class: shipmentProfile.shippingClass,
    shipping_mode: option.mode,
    shipping_amount_cents: String(option.amountCents),
  };

  return {
    sessionFields: {
      shipping_address_collection: {
        allowed_countries: getAllowedCountries(region),
      },
      shipping_options: [shippingOption],
    },
    metadata,
  };
}

exports.createArchiveCheckout = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  if (isOversizedBody(req.body)) {
    res.status(413).json({ error: "Request too large." });
    return;
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY || "";
  const archivePriceId = process.env.STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID || "";

  if (!stripeKey) {
    res.status(500).json({ error: "Server configuration error: STRIPE_SECRET_KEY is not set." });
    return;
  }
  if (!stripeKey.startsWith("sk_live_") && !stripeKey.startsWith("sk_test_")) {
    res.status(500).json({ error: "Server configuration error: STRIPE_SECRET_KEY does not look like a valid Stripe secret key." });
    return;
  }
  if (!archivePriceId) {
    res.status(500).json({ error: "Server configuration error: STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID is not set." });
    return;
  }

  const { selectedYear, selectedMonths } = req.body || {};

  // ── Input validation ───────────────────────────────────────────────────────
  if (!selectedYear || typeof selectedYear !== "string") {
    res.status(400).json({ error: "Please select a year first." });
    return;
  }
  if (!Array.isArray(selectedMonths) || selectedMonths.length === 0) {
    res.status(400).json({ error: "Please select at least one month." });
    return;
  }
  // Deduplicate and validate each month against server-side availability
  let uniqueMonths;
  try {
    uniqueMonths = validateArchiveSelection(selectedYear, selectedMonths);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  const shippingRegion = parseShippingRegion(req.body.shippingRegion);

  try {
    const stripeClient = stripe(stripeKey);

    const lineItems = [
      {
        price: archivePriceId,
        quantity: uniqueMonths.length,
      },
    ];

    const shipping = await buildCheckoutShipping(
      stripeClient,
      lineItems,
      shippingRegion,
      "createArchiveCheckout"
    );

    const metadata = {
      product_type: "kahani_times_archive",
      selected_year: selectedYear,
      selected_months: uniqueMonths.join(", "),
      selected_count: String(uniqueMonths.length),
      packaging: "Bundled together in one clear protective plastic sleeve",
      ...shipping.metadata,
    };

    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      ...shipping.sessionFields,
      metadata,
      payment_intent_data: { metadata },
      success_url:
        "https://kahanikorner.com/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://kahanikorner.com/subscribe.html",
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(
      "[createArchiveCheckout] Stripe error:",
      err.message
    );

    res.status(err.statusCode === 400 ? 400 : 500).json({
      error: err.message,
    });
  }
});

exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const key = process.env.STRIPE_SECRET_KEY || "";
  const archivePriceId = process.env.STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID || "";

  if (!key) {
    console.error("[createCheckoutSession] STRIPE_SECRET_KEY is not set.");
    res.status(500).json({ error: "Server configuration error: STRIPE_SECRET_KEY is not set." });
    return;
  }
  if (!key.startsWith("sk_live_") && !key.startsWith("sk_test_")) {
    console.error("[createCheckoutSession] STRIPE_SECRET_KEY does not look like a valid Stripe secret key.");
    res.status(500).json({ error: "Server configuration error: STRIPE_SECRET_KEY does not look like a valid Stripe secret key." });
    return;
  }

  if (isOversizedBody(req.body)) {
    res.status(413).json({ error: "Request too large." });
    return;
  }

  // Accept raw cart items (cartItems) from the frontend
  const { cartItems } = req.body || {};

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    res.status(400).json({ error: "No items in cart." });
    return;
  }

  console.log("[createCheckoutSession] Incoming cart items:", JSON.stringify(cartItems));

  let lineItems;
  let metadata;

  try {
    ({ lineItems, metadata } = buildCartLineItems(cartItems, archivePriceId));
  } catch (err) {
    res.status(err.statusCode === 400 ? 400 : 500).json({ error: err.message });
    return;
  }

  console.log("[createCheckoutSession] Built Stripe line items:", JSON.stringify(lineItems));
  console.log("[createCheckoutSession] Checkout metadata:", JSON.stringify(metadata));

  const shippingRegion = parseShippingRegion(req.body.shippingRegion);

  try {
    const stripeClient = stripe(key);

    const shipping = await buildCheckoutShipping(
      stripeClient,
      lineItems,
      shippingRegion,
      "createCheckoutSession"
    );

    Object.assign(metadata, shipping.metadata);

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      ...shipping.sessionFields,
      success_url: "https://kahanikorner.com/success.html",
      cancel_url:
        req.body.cancelUrl || "https://kahanikorner.com/products.html",
      metadata,
      payment_intent_data: { metadata },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(
      "[createCheckoutSession] Stripe error:",
      err.message
    );

    res.status(err.statusCode === 400 ? 400 : 500).json({
      error: err.message,
    });
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
You are a native Pakistani Urdu speaker and experienced language teacher. You think, speak, and write in Urdu naturally. Your task is to create fill-in-the-blank sentences for children and beginner learners.

THINKING ORDER — follow this every time:
  Step 1. Decide on a natural Urdu sentence a Pakistani parent or teacher would actually say out loud.
  Step 2. Check every word for grammar correctness (see URDU GRAMMAR RULES below) before writing anything.
  Step 3. Write the Urdu sentence in Urdu script.
  Step 4. Transliterate phonetically into Roman Urdu.
  Step 5. Translate naturally into English — derive from the Urdu, never the reverse.

URDU GRAMMAR RULES — apply all of these before finalising:

GENDER AGREEMENT (مذکر/مونث):
  - Adjectives ending in -aa (ا) are masculine; change to -ee (ی) for feminine nouns.
    e.g. اچھا لڑکا (good boy) → اچھی لڑکی (good girl)
  - Past tense verbs agree with the object for transitive verbs (ergative), or the subject for intransitive.
    Masculine singular past: -aa (گیا، کھایا، لکھا)
    Feminine singular past: -ee (گئی، کھائی، لکھی)
    Masculine plural past: -ay (گئے، کھائے)

ERGATIVE CONSTRUCTION (نے):
  - Transitive verbs in simple past REQUIRE نے after the subject.
    CORRECT: اس نے کھانا کھایا (He ate food)
    WRONG:   اس نے کھانا کھایا — verb must agree with object کھانا (masc.) → کھایا ✓
  - Intransitive verbs NEVER take نے.
    CORRECT: وہ گھر گیا (He went home) — no نے

VERB AGREEMENT WITH SUBJECT:
  - Present habitual: ہے (sing.) / ہیں (plural/formal)
    Masc. sing.: وہ جاتا ہے | Fem. sing.: وہ جاتی ہے
    Masc. plur.: وہ جاتے ہیں | Fem. plur.: وہ جاتی ہیں
  - Past copula: تھا (masc. sing.) / تھی (fem. sing.) / تھے (masc. plur.) / تھیں (fem. plur.)

POSTPOSITIONS — always follow the noun, never precede it:
  - میں (in/inside) | پر (on) | کو (to/for) | سے (from/with) | نے (ergative) | کا/کی/کے (of/possessive)
  - Possessive کا agrees with the POSSESSED noun: کا (masc.) / کی (fem.) / کے (plural)
    e.g. لڑکے کا بستہ (boy's bag — بستہ is masc.) | لڑکے کی کتاب (boy's book — کتاب is fem.)

WORD ORDER — Urdu is Subject → Object → Verb (SOV):
  - The verb almost always comes LAST.
  - Adjectives come BEFORE the noun they describe.
  - Time expressions typically come near the start.

STRICT OUTPUT RULES:
1. Respond with ONLY valid JSON — no markdown, no code fences, no explanation.
2. Use the target word naturally in the sentence, exactly once if possible.
3. Replace the target word with exactly "_____" (5 underscores) in the blank versions.
4. urduFull and urduBlank MUST be in Urdu script (Arabic alphabet) — NEVER Roman letters.
5. romanFull and romanBlank MUST be phonetic Roman Urdu — NEVER Urdu script. Sentence case only: capitalise the first letter, lowercase everything else (except proper nouns).
6. Roman Urdu must reflect Urdu pronunciation, NOT Hindi spellings:
     - ڑ → "r" (دوڑنا = "daurna", لڑکا = "larka") — NEVER "d" or "rh"
     - ھ (aspiration) → "h" after consonant: kh, gh, bh, ph, dh, th, jh
     - ق → "q" | خ → "kh" | غ → "gh" | ع → omit or " ' " | ح → "h"
     - Long vowels: آ → "aa", و → "oo", ی → "ee" when long
7. English translation must be natural and derived from the Urdu — not word-for-word.
8. Sentences must be child-friendly and culturally authentic to everyday Pakistani life.

STRONG CONTEXT CLUES — most important for learning:
  The sentence must make the answer feel obvious to someone who knows the word.
  - Describe what it DOES, LOOKS like, or a situation unique to it.
  - Use natural everyday speech — what a parent or teacher would say.
  - Avoid sentences where multiple words could fit.
  - BAD:  "Mujhe _____ pasand hai." (too generic — anything could fit)
  - GOOD: "Baarish mein bheegne se bachne ke liye hum _____ use karte hain." (clearly: umbrella)

DIFFICULTY — follow word counts strictly:
  easy   — MAXIMUM 5 Urdu words, base form only, single clear idea
  medium — 7–10 Urdu words, one contextual detail
  hard   — 11–16 Urdu words, rich scene, grammatical variant acceptable

REQUIRED JSON SCHEMA (return exactly these fields, nothing else):
{
  "level": "easy | medium | hard",
  "urduFull":           "complete Urdu sentence including the target word",
  "urduBlank":          "same Urdu sentence with _____ replacing the target word",
  "romanFull":          "complete Roman Urdu transliteration",
  "romanBlank":         "same Roman Urdu with _____ replacing the target word",
  "englishTranslation": "natural English translation of the full sentence",
  "englishBlank":       "same English translation with _____ replacing the English word/phrase for the target word",
  "answerUrdu":         "the exact token that was blanked — in Urdu script",
  "answerRoman":        "the exact token that was blanked — in Roman Urdu",
  "answerEnglish":      "the English word or short phrase that was blanked in englishBlank"
}`;

// Builds the per-request user prompt.
// To change how sentences are generated, edit only this function.
const DIFFICULTY_INSTRUCTIONS = {
  easy: `DIFFICULTY: EASY
- Sentence must be MAXIMUM 5 Urdu words total — very short, one idea only.
- Use the base form of the word (no grammatical variants).
- Example length: "Yeh _____ mitha hai." (This _____ is sweet.)`,

  medium: `DIFFICULTY: MEDIUM
- Sentence must be 7–10 Urdu words.
- Include one clear contextual detail that points to the answer.
- Example length: "Subah uthke baccha _____ peeta hai aur school jaata hai."`,

  hard: `DIFFICULTY: HARD
- Sentence must be 11–16 Urdu words.
- Include multiple context clues — describe a scene or situation.
- A grammatical variant of the word (plural, case form) is acceptable if natural.
- Example length: "Garmi ke mausam mein jab dhoop tez hoti hai, log thanda _____ pee kar sukoon paate hain."`,
};

function buildSentencePrompt(word, difficulty) {
  const variantLines =
    Array.isArray(word.variants) && word.variants.length > 0
      ? "\nGrammatical variants (use only if natural for the difficulty):\n" +
        word.variants
          .map((v) => `  - Urdu: "${v.urdu}"  Roman: "${v.romanUrdu}"`)
          .join("\n")
      : "";

  const diffInstruction = DIFFICULTY_INSTRUCTIONS[difficulty] || DIFFICULTY_INSTRUCTIONS.easy;

  return (
    `${diffInstruction}\n\n` +
    `Target word:\n` +
    `  Urdu script   : "${word.urdu}"\n` +
    `  Roman Urdu    : "${word.romanUrdu}"\n` +
    `  English       : "${word.english}"\n` +
    `  Part of speech: ${word.pos || "unknown"}\n` +
    `  Gender        : ${word.gender || "unknown"}` +
    variantLines +
    `\n\nGenerate the fill-in-the-blank sentence. Return only the JSON object.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grammar checker — second focused OpenAI call to validate and correct the
// generated sentence before it is shown to the user.
// Returns the (possibly corrected) sentence object, or throws on hard failure.
// ─────────────────────────────────────────────────────────────────────────────

const GRAMMAR_CHECK_PROMPT = `\
You are a native Pakistani Urdu speaker and grammar expert. You will be given a fill-in-the-blank Urdu sentence and the target word's details. Correct any grammatical errors so the sentence sounds exactly as a fluent native speaker would say it.

APPLY THESE SPECIFIC URDU GRAMMAR RULES:

1. GENDER AGREEMENT (مذکر/مونث):
   - Adjectives: -aa (ا) for masculine nouns, -ee (ی) for feminine.
   - Past tense intransitive verbs: agree with the subject's gender.
     Masc. sing. → -aa (گیا، آیا) | Fem. sing. → -ee (گئی، آئی)
   - Past tense transitive verbs (ergative): agree with the OBJECT's gender, not the subject.
     e.g. اس نے کتاب پڑھی (kitaab is fem. → parhi) | اس نے خط لکھا (khat is masc. → likha)

2. ERGATIVE نے:
   - Transitive verbs in simple past MUST have نے after the subject. No exceptions.
   - Intransitive verbs (آنا، جانا، ہونا، بیٹھنا، دوڑنا) NEVER take نے.

3. VERB FORMS — present habitual:
   - Masc. sing: جاتا ہے | Fem. sing: جاتی ہے | Masc. plur: جاتے ہیں | Fem. plur: جاتی ہیں

4. POSSESSIVE کا/کی/کے — agrees with the POSSESSED noun:
   - کا → masculine singular possessed noun
   - کی → feminine singular possessed noun
   - کے → plural possessed noun

5. WORD ORDER — Subject → Object → Verb. Verb comes LAST.

6. NATURALNESS — read the sentence aloud mentally. Would a Pakistani parent or teacher actually say this?
   If it sounds textbook or stiff, rephrase it to sound spoken and natural.

7. The blank _____ must remain in exactly the right grammatical position.

RESPONSE — return ONLY valid JSON with these exact fields (all required, even if unchanged):
{
  "urduFull":    "corrected or unchanged",
  "urduBlank":   "corrected or unchanged with _____",
  "romanFull":   "corrected or unchanged Roman",
  "romanBlank":  "corrected or unchanged Roman with _____",
  "answerUrdu":  "corrected or unchanged",
  "answerRoman": "corrected or unchanged",
  "changed":     true or false
}`;

async function grammarCheck(openai, word, sentence) {
  const prompt =
    `Word: "${word.urdu}" (${word.romanUrdu}) — ${word.english}\n` +
    `Gender: ${word.gender || "unknown"}  |  Part of speech: ${word.pos || "unknown"}\n\n` +
    `Sentence to check:\n` +
    `  urduFull  : ${sentence.urduFull}\n` +
    `  urduBlank : ${sentence.urduBlank}\n` +
    `  romanFull : ${sentence.romanFull}\n` +
    `  romanBlank: ${sentence.romanBlank}\n` +
    `  answerUrdu: ${sentence.answerUrdu}\n` +
    `  answerRoman: ${sentence.answerRoman}`;

  let raw = "";
  try {
    const res = await openai.chat.completions.create({
      model:       "gpt-4o",
      messages: [
        { role: "system", content: GRAMMAR_CHECK_PROMPT },
        { role: "user",   content: prompt },
      ],
      temperature: 0.2,   // low temperature — we want deterministic corrections
      max_tokens:  400,
    });
    raw = res.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Grammar check failure is non-fatal — log and return original sentence
    console.warn("[grammarCheck] OpenAI call failed:", err.message);
    return sentence;
  }

  try {
    const checked = JSON.parse(stripFences(raw));

    // Apply corrections to the sentence object
    const corrected = { ...sentence };
    for (const key of ["urduFull", "urduBlank", "romanFull", "romanBlank", "answerUrdu", "answerRoman"]) {
      if (checked[key] && typeof checked[key] === "string" && checked[key].trim()) {
        corrected[key] = checked[key];
      }
    }

    if (checked.changed) {
      console.log("[grammarCheck] Corrections applied to sentence.");
    } else {
      console.log("[grammarCheck] Sentence passed grammar check unchanged.");
    }

    return corrected;
  } catch (err) {
    // Parse failure is non-fatal — return original
    console.warn("[grammarCheck] Could not parse grammar check response:", err.message);
    return sentence;
  }
}

// Strip markdown code fences in case the model wraps its response.
function stripFences(raw) {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

// Returns true if the string contains a meaningful amount of Urdu/Arabic script.
function containsUrduScript(str) {
  // Unicode range for Arabic/Urdu script: U+0600–U+06FF
  const urduChars = (str.match(/[\u0600-\u06FF]/g) || []).length;
  return urduChars >= 2;
}

// Returns true if the string looks like it's mostly Latin/Roman characters.
function isRomanOnly(str) {
  const letters = (str.match(/[a-zA-Z]/g) || []).length;
  const urduChars = (str.match(/[\u0600-\u06FF]/g) || []).length;
  return letters > 0 && urduChars === 0;
}

// Validate all required fields exist, blanks are blanked, and scripts are correct.
function validateSentence(obj) {
  const required = [
    "level", "urduFull", "urduBlank", "romanFull",
    "romanBlank", "englishTranslation", "englishBlank", "answerUrdu", "answerRoman", "answerEnglish",
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
  if (!obj.englishBlank.includes("_____")) {
    throw new Error(`englishBlank is missing the _____ placeholder`);
  }
  // Script correctness checks
  if (!containsUrduScript(obj.urduFull)) {
    throw new Error(`urduFull does not contain Urdu script — got: "${obj.urduFull}"`);
  }
  if (!containsUrduScript(obj.urduBlank.replace(/_____/g, ""))) {
    throw new Error(`urduBlank does not contain Urdu script — got: "${obj.urduBlank}"`);
  }
  if (!isRomanOnly(obj.romanFull.replace(/_____/g, "").trim())) {
    throw new Error(`romanFull contains non-Roman characters — got: "${obj.romanFull}"`);
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

    // ── Call OpenAI with up to 3 attempts ─────────────────────────────────
    const openai   = new OpenAI({ apiKey });
    const messages = [
      { role: "system", content: SENTENCE_SYSTEM_PROMPT },
      { role: "user",   content: buildSentencePrompt(word, level) },
    ];

    const MAX_ATTEMPTS = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let rawContent = "";

      try {
        const completion = await openai.chat.completions.create({
          model:       "gpt-4o",
          messages,
          temperature: 0.7,
          max_tokens:  500,
        });
        rawContent = completion.choices[0]?.message?.content ?? "";
      } catch (err) {
        console.error(`[generateSentence] OpenAI error (attempt ${attempt}):`, err.message);
        res.status(502).json({
          success: false,
          error: "Could not reach the AI service. Please try again.",
        });
        return;
      }

      try {
        const parsed = JSON.parse(stripFences(rawContent));
        validateSentence(parsed);
        parsed.level = level;

        // Enforce sentence case on Roman fields
        const sentenceCase = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
        parsed.romanFull  = sentenceCase(parsed.romanFull);
        parsed.romanBlank = sentenceCase(parsed.romanBlank);

        // ── Grammar check before sending to client ────────────────────────
        const finalSentence = await grammarCheck(openai, word, parsed);

        // Re-enforce sentence case after grammar check (checker may return title case)
        finalSentence.romanFull  = sentenceCase(finalSentence.romanFull);
        finalSentence.romanBlank = sentenceCase(finalSentence.romanBlank);

        console.log(`[generateSentence] ✓  word="${word.romanUrdu}"  difficulty=${level}  attempt=${attempt}`);
        res.status(200).json({ success: true, sentence: finalSentence });
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[generateSentence] Validation failed (attempt ${attempt}): ${err.message}`);
        console.warn(`[generateSentence] Raw output: ${rawContent}`);

        // Tell the model what went wrong so the next attempt can correct it
        messages.push(
          { role: "assistant", content: rawContent },
          { role: "user",      content: `Your response failed validation: ${err.message}. Please try again, strictly following all rules — especially that urduFull/urduBlank must be Urdu script (Arabic alphabet) and romanFull/romanBlank must be Roman letters only.` }
        );
      }
    }

    console.error("[generateSentence] All attempts failed:", lastError?.message);
    res.status(502).json({
      success: false,
      error: "The AI returned an unexpected response. Please try again.",
    });
  });