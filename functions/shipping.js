// ─────────────────────────────────────────────────────────────────────────────
// Checkout shipping — trusted configuration and pure calculation helpers.
//
// Everything here is derived from server-side config only. The browser sends
// Stripe price IDs, quantities, a shipping region, a destination (country +
// postal code) and the shipping service code it picked; it never supplies
// weight, shipping class, shipping cost or free-shipping eligibility.
//
// No Stripe or EasyPost calls live here (index.js verifies prices / rates with
// Stripe, usps-rates.js fetches live USPS quotes), so these functions can be
// unit-tested in isolation:
//   node --test functions/shipping.test.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Shipping classes ─────────────────────────────────────────────────────────
// flat:   could go as untracked letter mail, but only if EVERY item in the cart
//         is flat.
// parcel: needs parcel shipping. One parcel item makes the whole shipment a
//         parcel.
const SHIPPING_CLASS = {
  FLAT: "flat",
  PARCEL: "parcel",
};

// Trusted outer package used for live USPS rating, by shipment class.
// Fill in EITHER all three dimensions (inches, measured on the packed mailer)
// OR an EasyPost predefinedPackage name (e.g. "FlatRateEnvelope") — not both.
// Until a class is configured, live rating is skipped for that class and the
// fixed US rate is used instead. Never derived from customer input.
const PACKAGE_DIMENSIONS = {
  [SHIPPING_CLASS.FLAT]: {
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    predefinedPackage: null,
  },
  [SHIPPING_CLASS.PARCEL]: {
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    predefinedPackage: null,
  },
};

// Trusted per-unit shipping data, keyed by Stripe price ID. Shipping weight is
// the sum of these weights × quantity — no packaging weight is added.
// Only products marked flat can ever go as stamped letter mail.
// A product missing from this map cannot be checked out online.
const PRODUCT_SHIPPING_DATA = {
  price_1SYLwPP4FFhr5UNAc6JmV0iR: { weightOz: 24, shippingClass: SHIPPING_CLASS.PARCEL }, // All Kahani's Bundle (4 books)
  price_1TbIF6P4FFhr5UNAXn6meNvr: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Abbu Laye Motor Car
  price_1TbIHDP4FFhr5UNAeyIkRrax: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Dada Jee Ka Khet
  price_1TbIIEP4FFhr5UNAaJeT8y6Y: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Chuchu Chacha
  price_1TbIGJP4FFhr5UNAeGEVz0Ko: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Aaloo Miyan
  price_1Tb6jbP4FFhr5UNAHcybrHON: { weightOz: 1,  shippingClass: SHIPPING_CLASS.FLAT },   // Oopsie Stickers
  price_1Tb6DjP4FFhr5UNApKWkP5wA: { weightOz: 1,  shippingClass: SHIPPING_CLASS.FLAT },   // Pakistani Mango Stickers
  price_1SvrPwP4FFhr5UNAhWnlzbu5: { weightOz: 1,  shippingClass: SHIPPING_CLASS.FLAT },   // Stickers (15-pack)
  price_1TjQGxP4FFhr5UNAMtrY7cJq: { weightOz: 5,  shippingClass: SHIPPING_CLASS.PARCEL }, // Pakistani Food Mini Coloring Book
};

// Kahani Times Archive is priced per edition via STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID
// (an env var, so it can't be a literal key above). Treated as parcel for now:
// editions ship together in a protective sleeve, not as a letter.
const ARCHIVE_SHIPPING_DATA = {
  weightOz: 1,
  shippingClass: SHIPPING_CLASS.PARCEL,
};

// ── Destinations ─────────────────────────────────────────────────────────────

const US_SHIPPING_COUNTRIES = ["US"];
const CA_SHIPPING_COUNTRIES = ["CA"];

const INTL_SHIPPING_COUNTRIES = (
  "AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ " +
  "BR BS BT BV BW BY BZ CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC " +
  "EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB " +
  "LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU " +
  "RW SA SB SC SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG UY UZ VA VC VE VG VN VU WF WS XK YE YT ZA ZM ZW ZZ"
).split(" ");

// ── Rates ────────────────────────────────────────────────────────────────────
// Each fixed rate names the env var holding its Stripe shipping-rate ID and the
// amount that Stripe rate must have; index.js rejects any mismatch.

const FREE_US_SHIPPING_THRESHOLD_CENTS = 6500;

// Fixed US rates: used whenever live USPS rating is unavailable.
const US_SHIPPING_RATES = {
  standard: { env: "STRIPE_US_STANDARD_SHIPPING_RATE_ID", amountCents: 499 },
  free:     { env: "STRIPE_US_FREE_SHIPPING_RATE_ID", amountCents: 0 },
};

// Canada / International: tier is chosen by totalWeightOz (product weight only).
// 8 / 16 / 32 / 48 / 64 oz = 0.5 / 1 / 2 / 3 / 4 lb.
const WEIGHT_SHIPPING_RATES = {
  CA: [
    { maxOz: 8,  env: "STRIPE_CA_SHIPPING_8OZ_RATE_ID",  amountCents: 1299 },
    { maxOz: 16, env: "STRIPE_CA_SHIPPING_16OZ_RATE_ID", amountCents: 1499 },
    { maxOz: 32, env: "STRIPE_CA_SHIPPING_32OZ_RATE_ID", amountCents: 1899 },
    { maxOz: 48, env: "STRIPE_CA_SHIPPING_48OZ_RATE_ID", amountCents: 2299 },
    { maxOz: 64, env: "STRIPE_CA_SHIPPING_64OZ_RATE_ID", amountCents: 2999 },
  ],
  INTL: [
    { maxOz: 8,  env: "STRIPE_INTL_SHIPPING_8OZ_RATE_ID",  amountCents: 1499 },
    { maxOz: 16, env: "STRIPE_INTL_SHIPPING_16OZ_RATE_ID", amountCents: 1899 },
    { maxOz: 32, env: "STRIPE_INTL_SHIPPING_32OZ_RATE_ID", amountCents: 2299 },
    { maxOz: 48, env: "STRIPE_INTL_SHIPPING_48OZ_RATE_ID", amountCents: 2999 },
    { maxOz: 64, env: "STRIPE_INTL_SHIPPING_64OZ_RATE_ID", amountCents: 3399 },
  ],
};

// Untracked US letter mail (USPS stamped First-Class Mail letter prices:
// $0.82 first ounce + $0.29 each additional ounce). Used instead of the US
// parcel rate when the order is US, every item is flat, and the total product
// weight is within the last tier. Heavier or mixed orders use parcel shipping.
// US-only on purpose: stickers sent to Canada / abroad are merchandise and need
// a customs-capable package service.
const US_UNTRACKED_LETTER_RATES = [
  { maxOz: 1, amountCents: 82 },
  { maxOz: 2, amountCents: 111 },
  { maxOz: 3, amountCents: 140 },
];

// Service codes shared with the frontend (it sends one back as
// selectedShippingService). Dollar amounts are never accepted from the browser.
const SHIPPING_SERVICE = {
  USPS_GROUND_ADVANTAGE: "GroundAdvantage",
  USPS_PRIORITY: "Priority",
  USPS_EXPRESS: "Express",
  UNTRACKED_LETTER: "UNTRACKED_LETTER",
  US_STANDARD: "FIXED_STANDARD",        // fixed $4.99 / free-over-$65 fallback
  WEIGHT_TIER: "FIXED_WEIGHT_TIER",     // Canada / International tiers
};

// Recorded in Stripe metadata as shipping_mode.
const SHIPPING_MODE = {
  LIVE_USPS: "live_usps",
  FIXED_FALLBACK: "fixed_fallback",
  UNTRACKED_LETTER: "untracked_letter",
};

// Approved live USPS services, keyed by EasyPost's service name. Anything else
// EasyPost returns (other carriers, Media Mail, etc.) is discarded.
// deliveryEstimate is USPS's published service standard, shown to customers.
const USPS_SERVICES = {
  [SHIPPING_SERVICE.USPS_GROUND_ADVANTAGE]: {
    displayName: "USPS Ground Advantage",
    deliveryEstimate: { minBusinessDays: 2, maxBusinessDays: 5 },
  },
  [SHIPPING_SERVICE.USPS_PRIORITY]: {
    displayName: "USPS Priority Mail",
    deliveryEstimate: { minBusinessDays: 1, maxBusinessDays: 3 },
  },
  [SHIPPING_SERVICE.USPS_EXPRESS]: {
    displayName: "USPS Priority Mail Express",
    deliveryEstimate: { minBusinessDays: 1, maxBusinessDays: 2 },
  },
};

// ── Errors ───────────────────────────────────────────────────────────────────

function checkoutError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ── Shipment profile ─────────────────────────────────────────────────────────

// Trusted shipping data for one Stripe price ID, or null when not configured.
function getShippingProductData(priceId, archivePriceId) {
  if (archivePriceId && priceId === archivePriceId) {
    return ARCHIVE_SHIPPING_DATA;
  }

  return Object.prototype.hasOwnProperty.call(PRODUCT_SHIPPING_DATA, priceId)
    ? PRODUCT_SHIPPING_DATA[priceId]
    : null;
}

// lineItems: [{ price, quantity }] as sent to Stripe (quantity already validated).
// Throws a customer-safe 400 if any product has no trusted shipping data.
function calculateShipmentProfile(lineItems, archivePriceId) {
  let itemWeightOz = 0;
  let hasParcelItem = false;
  const unknown = [];

  for (const li of lineItems) {
    const data = getShippingProductData(li.price, archivePriceId);

    if (!data) {
      unknown.push(li.price);
      continue;
    }

    itemWeightOz += data.weightOz * li.quantity;
    if (data.shippingClass !== SHIPPING_CLASS.FLAT) hasParcelItem = true;
  }

  if (unknown.length > 0) {
    console.error(
      `[shipping] No shipping data on file for: ${unknown.join(", ")}`
    );

    throw checkoutError(
      "Some items in your order can't be shipped online yet. Please contact us to place this order.",
      400
    );
  }

  const shippingClass = hasParcelItem
    ? SHIPPING_CLASS.PARCEL
    : SHIPPING_CLASS.FLAT;

  return {
    itemWeightOz,
    totalWeightOz: itemWeightOz, // product weight only — no packaging added
    shippingClass,
    flatEligible: shippingClass === SHIPPING_CLASS.FLAT,
  };
}

// Trusted parcel for live rating: { parcel } or { missing: [...] }.
// EasyPost weight is in ounces; dimensions in inches.
function getRatingParcel(shipmentProfile) {
  const dims = PACKAGE_DIMENSIONS[shipmentProfile.shippingClass] || {};
  const weight = Math.ceil(shipmentProfile.totalWeightOz * 10) / 10;

  if (dims.predefinedPackage) {
    return { parcel: { weight, predefined_package: dims.predefinedPackage } };
  }

  const missing = ["lengthIn", "widthIn", "heightIn"].filter(
    (k) => !(typeof dims[k] === "number" && dims[k] > 0)
  );

  if (missing.length > 0) {
    return {
      missing: missing.map(
        (k) => `PACKAGE_DIMENSIONS.${shipmentProfile.shippingClass}.${k}`
      ),
    };
  }

  return {
    parcel: {
      weight,
      length: dims.lengthIn,
      width: dims.widthIn,
      height: dims.heightIn,
    },
  };
}

// ── Destination ──────────────────────────────────────────────────────────────

const US_ZIP_RE = /^(\d{5})(?:-\d{4})?$/;
const CA_POSTAL_RE = /^([A-Z]\d[A-Z]) ?(\d[A-Z]\d)$/;
const INTL_POSTAL_RE = /^[A-Z0-9][A-Z0-9 -]{1,9}$/;

// Validates the browser's destination against the chosen shipping region and
// returns a normalized { country, postalCode } — or null when none was sent.
// Used only for carrier rating and region consistency; Stripe Checkout still
// collects the full address.
function validateDestination(region, destination) {
  if (destination === undefined || destination === null) return null;

  const bad = (msg) => checkoutError(msg, 400);

  if (typeof destination !== "object" || Array.isArray(destination)) {
    throw bad("Please enter a valid shipping destination.");
  }

  const country =
    typeof destination.country === "string"
      ? destination.country.trim().toUpperCase()
      : "";
  const rawPostal =
    typeof destination.postalCode === "string"
      ? destination.postalCode.trim().toUpperCase()
      : "";

  if (!/^[A-Z]{2}$/.test(country) || rawPostal.length > 12) {
    throw bad("Please enter a valid shipping destination.");
  }

  if (region === "US") {
    if (country !== "US") {
      throw bad("That destination isn't in the United States. Please change “Shipping to” and try again.");
    }
    const m = US_ZIP_RE.exec(rawPostal);
    if (!m) throw bad("Please enter a valid 5-digit US ZIP code.");
    return { country, postalCode: m[1] };
  }

  if (region === "CA") {
    if (country !== "CA") {
      throw bad("That destination isn't in Canada. Please change “Shipping to” and try again.");
    }
    const m = CA_POSTAL_RE.exec(rawPostal);
    if (!m) throw bad("Please enter a valid Canadian postal code (e.g. K1A 0B1).");
    return { country, postalCode: `${m[1]} ${m[2]}` };
  }

  // INTL: any supported country other than US / CA; postal code optional.
  if (country === "US" || country === "CA") {
    throw bad("For the United States or Canada, please choose that option under “Shipping to”.");
  }
  if (!INTL_SHIPPING_COUNTRIES.includes(country)) {
    throw bad("Sorry, we can't ship to that country online yet. Please contact us.");
  }
  if (rawPostal && !INTL_POSTAL_RE.test(rawPostal)) {
    throw bad("Please enter a valid postal code, or leave it blank if your country doesn't use one.");
  }
  return { country, postalCode: rawPostal };
}

// ── Service selection ────────────────────────────────────────────────────────

function getWeightTierRate(region, totalWeightOz) {
  const rate = WEIGHT_SHIPPING_RATES[region].find(
    (tier) => totalWeightOz <= tier.maxOz
  );

  if (!rate) {
    throw checkoutError(
      "Orders over 4 lb can't be shipped to Canada or internationally online yet. Please contact us to place this order.",
      400
    );
  }

  return rate;
}

// US-only untracked letter option for flat-only shipments within the letter
// weight tiers, or null.
function getLetterMailOption(shipmentProfile, region) {
  if (region !== "US" || !shipmentProfile.flatEligible) return null;

  const tier = US_UNTRACKED_LETTER_RATES.find(
    (t) => shipmentProfile.totalWeightOz <= t.maxOz
  );
  if (!tier) return null;

  return {
    service: SHIPPING_SERVICE.UNTRACKED_LETTER,
    mode: SHIPPING_MODE.UNTRACKED_LETTER,
    displayName: "Untracked Letter Mail",
    amountCents: tier.amountCents,
    tracked: false,
    freeUsShipping: false,
  };
}

function fixedOption(service, displayName, rate, freeUsShipping) {
  return {
    service,
    mode: SHIPPING_MODE.FIXED_FALLBACK,
    displayName,
    amountCents: rate.amountCents,
    rate, // verified against Stripe and passed as a shipping_rate ID
    freeUsShipping,
  };
}

// Returns the shipping options to offer, cheapest first. Each option is
// { service, mode, displayName, amountCents, freeUsShipping, ... } plus either
// `rate` (a fixed Stripe shipping-rate config) or nothing (index.js then sends
// trusted shipping_rate_data with amountCents).
//
// liveUspsRates: normalized rates from usps-rates.js, or null/[] when live
// rating is unavailable — in which case the fixed rates are used (fallback).
//
// US letter-eligible orders (all flat, within the letter tiers, under $65):
//   fixed: Untracked Letter Mail replaces the $4.99 parcel rate.
//   live:  Untracked Letter Mail is offered alongside the live USPS services.
//
// Free US shipping ($65+ merchandise subtotal) always wins over letter postage:
//   live:  the cheapest TRACKED service (normally Ground Advantage) becomes $0;
//          faster services keep their real price; letter mail is not offered.
//   fixed: the existing $0 Stripe rate, as before.
function getAvailableShippingServices(
  shipmentProfile,
  region,
  subtotalCents,
  liveUspsRates
) {
  if (region === "US") {
    const freeUsShipping = subtotalCents >= FREE_US_SHIPPING_THRESHOLD_CENTS;
    const letter = freeUsShipping
      ? null
      : getLetterMailOption(shipmentProfile, region);
    const options = [];

    if (Array.isArray(liveUspsRates) && liveUspsRates.length > 0) {
      const tracked = liveUspsRates
        .map((r) => ({
          service: r.serviceCode,
          mode: SHIPPING_MODE.LIVE_USPS,
          displayName: r.displayName,
          amountCents: r.amountCents,
          quotedAmountCents: r.amountCents,
          tracked: true,
          freeUsShipping: false,
          estimatedDays: r.estimatedDays,
          deliveryEstimate: USPS_SERVICES[r.serviceCode].deliveryEstimate,
        }))
        .sort((a, b) => a.amountCents - b.amountCents);

      if (freeUsShipping) {
        tracked[0].amountCents = 0;
        tracked[0].freeUsShipping = true; // Stripe Checkout labels $0 rates "Free"
      }

      options.push(...tracked);
    } else if (freeUsShipping) {
      options.push(fixedOption(SHIPPING_SERVICE.US_STANDARD, "Free US Shipping", US_SHIPPING_RATES.free, true));
    } else if (!letter) {
      options.push(fixedOption(SHIPPING_SERVICE.US_STANDARD, "Standard US Shipping", US_SHIPPING_RATES.standard, false));
    }

    if (letter) options.push(letter);

    return options.sort((a, b) => a.amountCents - b.amountCents);
  }

  // Canada / International: current fixed weight tiers (no letter mail —
  // merchandise needs a customs-capable package service).
  const tierRate = getWeightTierRate(region, shipmentProfile.totalWeightOz);

  return [
    fixedOption(
      SHIPPING_SERVICE.WEIGHT_TIER,
      region === "CA" ? "Canada Shipping" : "International Shipping",
      tierRate,
      false
    ),
  ];
}

const LIVE_SERVICE_CODES = Object.keys(USPS_SERVICES);

// Picks what to send to Stripe for the customer's chosen service code.
//   - no code sent        → every available option (customer picks in Stripe)
//   - code available      → just that option, at today's trusted price
//   - live code, but live rating is down right now → the fixed fallback rate,
//     so checkout keeps working
//   - otherwise           → 400 asking the customer to refresh shipping options
function selectShippingOptions(options, selectedShippingService) {
  if (
    selectedShippingService === undefined ||
    selectedShippingService === null ||
    selectedShippingService === ""
  ) {
    return options;
  }

  const refresh = checkoutError(
    "The shipping option you picked is no longer available for this order. Please refresh shipping options and try again.",
    400
  );

  if (
    typeof selectedShippingService !== "string" ||
    selectedShippingService.length > 40
  ) {
    throw refresh;
  }

  const match = options.find((o) => o.service === selectedShippingService);
  if (match) return [match];

  const liveOffered = options.some((o) => o.mode === SHIPPING_MODE.LIVE_USPS);
  if (!liveOffered && LIVE_SERVICE_CODES.includes(selectedShippingService)) {
    const fallback = options.filter(
      (o) => o.mode === SHIPPING_MODE.FIXED_FALLBACK
    );
    if (fallback.length > 0) return fallback;
  }

  throw refresh;
}

module.exports = {
  SHIPPING_CLASS,
  PACKAGE_DIMENSIONS,
  PRODUCT_SHIPPING_DATA,
  ARCHIVE_SHIPPING_DATA,
  US_SHIPPING_COUNTRIES,
  CA_SHIPPING_COUNTRIES,
  INTL_SHIPPING_COUNTRIES,
  FREE_US_SHIPPING_THRESHOLD_CENTS,
  US_SHIPPING_RATES,
  WEIGHT_SHIPPING_RATES,
  US_UNTRACKED_LETTER_RATES,
  SHIPPING_SERVICE,
  SHIPPING_MODE,
  USPS_SERVICES,
  checkoutError,
  getShippingProductData,
  calculateShipmentProfile,
  getRatingParcel,
  validateDestination,
  getAvailableShippingServices,
  selectShippingOptions,
};
