// End-to-end tests of the checkout HTTP handlers in index.js with an in-memory
// fake of the `stripe` module (no network, no real keys).
// Run: node --test functions/checkout.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

// ── Fakes ────────────────────────────────────────────────────────────────────
const BOOK = "price_1TbIF6P4FFhr5UNAXn6meNvr";    // $12.99, 6 oz parcel
const STICKER = "price_1Tb6jbP4FFhr5UNAHcybrHON"; // $4.99, 1 oz flat
const BUNDLE = "price_1SYLwPP4FFhr5UNAc6JmV0iR";  // $62.00, 24 oz parcel
const ARCHIVE = "price_archive_test";
const UNMAPPED = "price_unmapped_onetime";

const STRIPE_PRICES = { [BOOK]: 1299, [STICKER]: 499, [BUNDLE]: 6200, [ARCHIVE]: 500, [UNMAPPED]: 1000 };
const FIXED_RATES = {
  STRIPE_US_FREE_SHIPPING_RATE_ID: 0,
  STRIPE_CA_SHIPPING_8OZ_RATE_ID: 1299, STRIPE_CA_SHIPPING_16OZ_RATE_ID: 1499,
  STRIPE_CA_SHIPPING_32OZ_RATE_ID: 1899, STRIPE_CA_SHIPPING_48OZ_RATE_ID: 2299,
  STRIPE_CA_SHIPPING_64OZ_RATE_ID: 2999, STRIPE_INTL_SHIPPING_8OZ_RATE_ID: 1499,
  STRIPE_INTL_SHIPPING_16OZ_RATE_ID: 1899, STRIPE_INTL_SHIPPING_32OZ_RATE_ID: 2299,
  STRIPE_INTL_SHIPPING_48OZ_RATE_ID: 2999, STRIPE_INTL_SHIPPING_64OZ_RATE_ID: 3399,
};

Object.assign(process.env, {
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID: ARCHIVE,
});
for (const name of Object.keys(FIXED_RATES)) process.env[name] = `shr_${name}`;

let sessions = [];
const fakeStripe = () => ({
  prices: {
    retrieve: async (id) => ({ id, active: id in STRIPE_PRICES, type: "one_time", currency: "usd", unit_amount: STRIPE_PRICES[id] }),
  },
  shippingRates: {
    retrieve: async (id) => ({ id, active: true, type: "fixed_amount", fixed_amount: { currency: "usd", amount: FIXED_RATES[id.replace(/^shr_/, "")] } }),
  },
  checkout: {
    sessions: { create: async (params) => { sessions.push(params); return { url: "https://checkout.test/session" }; } },
  },
});

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "stripe") return fakeStripe;
  return originalLoad.call(this, request, ...rest);
};

const fns = require("./index");

// Keep handler logs out of the test output.
for (const k of ["log", "warn", "error"]) console[k] = () => {};

test.beforeEach(() => {
  sessions = [];
});

async function call(fnName, body) {
  let status;
  let json;
  const req = { method: "POST", body, headers: {}, ip: "127.0.0.1", get: () => undefined };
  const res = {
    set() {},
    status(s) { status = s; return this; },
    json(j) { json = j; },
    send() {},
  };
  await fns[fnName](req, res);
  return { status, json, session: sessions[sessions.length - 1] };
}

const cart = (...items) => items.map(([id, quantity]) => ({ id, quantity, name: "x", price: 0.01 }));
const checkout = (items, extra = {}) =>
  call("createCheckoutSession", { cartItems: items, shippingRegion: "US", ...extra });
const stripeOption = (session) => {
  const [o] = session.shipping_options;
  return o.shipping_rate ? o.shipping_rate : [o.shipping_rate_data.display_name, o.shipping_rate_data.fixed_amount.amount];
};

// ── Tests ────────────────────────────────────────────────────────────────────

test("only the checkout and sentence functions are exported (no shipping-quote endpoint)", () => {
  assert.deepEqual(Object.keys(fns).sort(), ["createArchiveCheckout", "createCheckoutSession", "generateSentence"]);
});

test("US book (6 oz) → pound table $4.39 on Stripe", async () => {
  const { status, session } = await checkout(cart([BOOK, 1]));
  assert.equal(status, 200);
  assert.equal(session.shipping_options.length, 1);
  assert.deepEqual(session.shipping_options[0], {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 439, currency: "usd" },
      display_name: "US Shipping",
      metadata: { shipping_mode: "us_weight_table" },
    },
  });
  assert.deepEqual(session.shipping_address_collection.allowed_countries, ["US"]);
  assert.equal(session.metadata.shipping_mode, "us_weight_table");
  assert.equal(session.metadata.shipping_amount_cents, "439");
  assert.equal(session.metadata.shipment_weight_oz, "6");
});

test("US quantity crosses a pound threshold: 2 books (12 oz) $4.39 → 3 books (18 oz) $5.13", async () => {
  assert.deepEqual(stripeOption((await checkout(cart([BOOK, 2]))).session), ["US Shipping", 439]);
  assert.deepEqual(stripeOption((await checkout(cart([BOOK, 3]))).session), ["US Shipping", 513]);
});

test("US sticker-only 1 / 6 oz → Untracked Letter Mail $0.82 / $2.27; 7 oz → $4.39", async () => {
  assert.deepEqual(stripeOption((await checkout(cart([STICKER, 1]))).session), ["Untracked Letter Mail", 82]);
  const six = (await checkout(cart([STICKER, 6]))).session;
  assert.deepEqual(stripeOption(six), ["Untracked Letter Mail", 227]);
  assert.equal(six.metadata.shipping_mode, "untracked_letter");
  assert.deepEqual(stripeOption((await checkout(cart([STICKER, 7]))).session), ["US Shipping", 439]);
});

test("US sticker + book → pound table, no letter mail", async () => {
  assert.deepEqual(stripeOption((await checkout(cart([STICKER, 1], [BOOK, 1]))).session), ["US Shipping", 439]);
});

test("US $65+ → existing free Stripe rate", async () => {
  const { session } = await checkout(cart([BUNDLE, 2])); // $124, 48 oz
  assert.equal(stripeOption(session), "shr_STRIPE_US_FREE_SHIPPING_RATE_ID");
  assert.equal(session.metadata.free_us_shipping, "true");
  assert.equal(session.metadata.shipping_mode, "us_free");
});

test("US just under $65 → pound table", async () => {
  const { session } = await checkout(cart([BUNDLE, 1])); // $62, 24 oz → 2 lb
  assert.deepEqual(stripeOption(session), ["US Shipping", 513]);
  assert.equal(session.metadata.free_us_shipping, "false");
});

test("US over 70 lb → 400 contact us, no session", async () => {
  const { status, json } = await checkout(cart([BUNDLE, 47])); // 70.5 lb
  assert.equal(status, 400);
  assert.equal(json.error, "Please contact us for shipping on orders over 70 lb.");
  assert.equal(sessions.length, 0);
});

test("Canada / International → existing weight-tier Stripe rates", async () => {
  const ca = await call("createCheckoutSession", { cartItems: cart([STICKER, 9]), shippingRegion: "CA" });
  assert.equal(stripeOption(ca.session), "shr_STRIPE_CA_SHIPPING_16OZ_RATE_ID");
  assert.deepEqual(ca.session.shipping_address_collection.allowed_countries, ["CA"]);

  const intl = await call("createCheckoutSession", { cartItems: cart([STICKER, 8]), shippingRegion: "INTL" });
  assert.equal(stripeOption(intl.session), "shr_STRIPE_INTL_SHIPPING_8OZ_RATE_ID");
  assert.ok(intl.session.shipping_address_collection.allowed_countries.includes("GB"));

  const tooHeavy = await call("createCheckoutSession", { cartItems: cart([BUNDLE, 3]), shippingRegion: "INTL" });
  assert.equal(tooHeavy.status, 400);
  assert.match(tooHeavy.json.error, /over 4 lb/);
});

test("frontend shipping amounts, weights, ZIP and service codes are ignored", async () => {
  const items = [{ id: BOOK, quantity: 3, name: "x", price: 0.01, weightOz: 0.1, shippingClass: "flat", shippingAmountCents: 0 }];
  const { status, session } = await checkout(items, {
    shippingAmount: 0,
    shippingAmountCents: 0,
    amountCents: 0,
    shippingCost: 0,
    freeShipping: true,
    weightOz: 0.1,
    totalWeightLb: 0.1,
    destination: { country: "US", postalCode: "10001" },
    selectedShippingService: "Express",
  });
  assert.equal(status, 200);
  assert.deepEqual(session.line_items, [{ price: BOOK, quantity: 3 }]);
  assert.deepEqual(stripeOption(session), ["US Shipping", 513]); // 18 oz → 2 lb
  assert.equal(session.metadata.free_us_shipping, "false");
  assert.equal(session.metadata.shipment_class, "parcel");
});

test("unknown product → safe 400 rejection", async () => {
  const { status, json } = await checkout(cart([UNMAPPED, 1]));
  assert.equal(status, 400);
  assert.match(json.error, /contact us/i);
  assert.equal(sessions.length, 0);
});

test("Archive Buy Now: parcel class, pound table", async () => {
  const { status, session } = await call("createArchiveCheckout", {
    selectedYear: "2026",
    selectedMonths: ["January", "February", "March"],
    shippingRegion: "US",
  });
  assert.equal(status, 200);
  assert.equal(session.metadata.product_type, "kahani_times_archive");
  assert.equal(session.metadata.shipment_class, "parcel");
  assert.deepEqual(stripeOption(session), ["US Shipping", 439]); // 3 oz parcel, not letter mail
});

test("archive inside the cart → parcel, pound table", async () => {
  const { session } = await checkout([
    { productType: "kahani_times_archive", selectedYear: "2026", selectedMonths: ["January"] },
    { id: STICKER, quantity: 1 },
  ]);
  assert.deepEqual(stripeOption(session), ["US Shipping", 439]);
  assert.equal(session.metadata.has_archive, "true");
});

test("abuse limits: oversized payload, huge quantity, too many lines", async () => {
  assert.equal((await checkout(cart([BOOK, 1]), { junk: "x".repeat(40000) })).status, 413);
  assert.equal((await checkout(cart([BOOK, 51]))).status, 400);
  assert.equal((await checkout(Array.from({ length: 31 }, () => ({ id: BOOK, quantity: 1 })))).status, 400);
  assert.equal(sessions.length, 0);
});
