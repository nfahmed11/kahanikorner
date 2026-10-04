// End-to-end tests of the HTTP handlers in index.js with in-memory fakes for
// the `stripe` and `@easypost/api` modules (no network, no real keys).
// Run: node --test functions/checkout.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

// ── Fakes ────────────────────────────────────────────────────────────────────
const BOOK = "price_1TbIF6P4FFhr5UNAXn6meNvr";    // $12.99, 6 oz parcel
const STICKER = "price_1Tb6jbP4FFhr5UNAHcybrHON"; // $4.99, 1 oz flat
const BUNDLE = "price_1SYLwPP4FFhr5UNAc6JmV0iR";  // $69.99, 24 oz parcel
const ARCHIVE = "price_archive_test";
const UNMAPPED = "price_unmapped_onetime";

const STRIPE_PRICES = { [BOOK]: 1299, [STICKER]: 499, [BUNDLE]: 6999, [ARCHIVE]: 500, [UNMAPPED]: 1000 };
const FIXED_RATES = {
  STRIPE_US_STANDARD_SHIPPING_RATE_ID: 499, STRIPE_US_FREE_SHIPPING_RATE_ID: 0,
  STRIPE_CA_SHIPPING_8OZ_RATE_ID: 1299, STRIPE_CA_SHIPPING_16OZ_RATE_ID: 1499,
  STRIPE_CA_SHIPPING_32OZ_RATE_ID: 1899, STRIPE_CA_SHIPPING_48OZ_RATE_ID: 2299,
  STRIPE_CA_SHIPPING_64OZ_RATE_ID: 2999, STRIPE_INTL_SHIPPING_8OZ_RATE_ID: 1499,
  STRIPE_INTL_SHIPPING_16OZ_RATE_ID: 1899, STRIPE_INTL_SHIPPING_32OZ_RATE_ID: 2299,
  STRIPE_INTL_SHIPPING_48OZ_RATE_ID: 2999, STRIPE_INTL_SHIPPING_64OZ_RATE_ID: 3399,
};
const LIVE_ENV = {
  EASYPOST_API_KEY: "EZTK_test_fake",
  SHIP_FROM_NAME: "Kahani Korner",
  SHIP_FROM_STREET1: "1 Test St",
  SHIP_FROM_CITY: "Testville",
  SHIP_FROM_STATE: "TX",
  SHIP_FROM_ZIP: "75001",
  SHIP_FROM_COUNTRY: "US",
};

Object.assign(process.env, {
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID: ARCHIVE,
  ...LIVE_ENV,
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

let easypostRates;     // what the fake EasyPost returns next
let easypostFails = false;
let easypostCalls = [];
class FakeEasyPost {
  constructor(apiKey) {
    this.Shipment = {
      create: async (params) => {
        easypostCalls.push({ apiKey, params });
        if (easypostFails) throw new Error("EasyPost 503 Service Unavailable");
        return { rates: easypostRates };
      },
    };
  }
}

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "stripe") return fakeStripe;
  if (request === "@easypost/api") return FakeEasyPost;
  return originalLoad.call(this, request, ...rest);
};

const { PACKAGE_DIMENSIONS } = require("./shipping");
const fns = require("./index");

// Keep handler logs out of the test output.
for (const k of ["log", "warn", "error"]) console[k] = () => {};

const usps = (ga, pri, exp) => [
  { carrier: "USPS", service: "GroundAdvantage", rate: ga, currency: "USD", delivery_days: 4 },
  { carrier: "USPS", service: "Priority", rate: pri, currency: "USD", delivery_days: 2 },
  ...(exp ? [{ carrier: "USPS", service: "Express", rate: exp, currency: "USD", delivery_days: 1 }] : []),
  { carrier: "UPS", service: "Ground", rate: "2.00", currency: "USD" },
  { carrier: "FedEx", service: "FEDEX_GROUND", rate: "2.50", currency: "USD" },
];

test.beforeEach(() => {
  sessions = [];
  easypostCalls = [];
  easypostFails = false;
  easypostRates = usps("5.82", "10.40", "31.50");
  Object.assign(process.env, LIVE_ENV);
  Object.assign(PACKAGE_DIMENSIONS.parcel, { lengthIn: 10, widthIn: 8, heightIn: 2 });
  Object.assign(PACKAGE_DIMENSIONS.flat, { lengthIn: 9, widthIn: 6, heightIn: 0.25 });
});

async function call(fnName, body, headers = {}) {
  let status;
  let json;
  const req = { method: "POST", body, headers, ip: "127.0.0.1", get: () => undefined };
  const res = {
    set() {},
    status(s) { status = s; return this; },
    json(j) { json = j; },
    send() {},
  };
  await fns[fnName](req, res);
  return { status, json, session: sessions[sessions.length - 1] };
}

const US_DEST = { country: "US", postalCode: "10001" };
const cart = (...items) => items.map(([id, quantity]) => ({ id, quantity, name: "x", price: 0.01 }));
const quote = (items, extra = {}) =>
  call("getShippingOptions", { cartItems: items, shippingRegion: "US", destination: US_DEST, ...extra });
const checkout = (items, extra = {}) =>
  call("createCheckoutSession", { cartItems: items, shippingRegion: "US", destination: US_DEST, ...extra });

// ── Tests ────────────────────────────────────────────────────────────────────

test("1+2. US parcel quote → only USPS Ground Advantage / Priority / Express", async () => {
  const { status, json } = await quote(cart([BOOK, 1]));
  assert.equal(status, 200);
  assert.equal(json.liveRates, true);
  assert.deepEqual(json.options.map((o) => o.code), ["GroundAdvantage", "Priority", "Express"]);
  assert.deepEqual(json.options.map((o) => o.label), ["USPS Ground Advantage", "USPS Priority Mail", "USPS Priority Mail Express"]);
  assert.deepEqual(json.options.map((o) => o.amountCents), [582, 1040, 3150]);
});

test("quote response exposes no weights, shipping class or carrier rate IDs", async () => {
  const { json } = await quote(cart([BOOK, 1]));
  const text = JSON.stringify(json);
  for (const leak of ["weight", "shippingClass", "parcel", "rate_", "shr_", "EZTK"]) {
    assert.ok(!text.includes(leak), leak);
  }
});

test("3. flat US cart (2 oz) quote: letter mail $1.11 beside live services, no packaging weight", async () => {
  const { json } = await quote(cart([STICKER, 2]));
  assert.deepEqual(json.options.map((o) => [o.code, o.amountCents]), [
    ["UNTRACKED_LETTER", 111],
    ["GroundAdvantage", 582],
    ["Priority", 1040],
    ["Express", 3150],
  ]);
  assert.equal(json.options[0].tracked, false);
  assert.equal(easypostCalls[0].params.parcel.weight, 2); // 2 × 1 oz, nothing added
});

test("5. Canada → current fixed tier, EasyPost not called", async () => {
  const body = { cartItems: cart([BOOK, 1]), shippingRegion: "CA", destination: { country: "CA", postalCode: "K1A 0B1" } };
  const q = await call("getShippingOptions", body);
  assert.deepEqual(q.json.options.map((o) => [o.code, o.amountCents]), [["FIXED_WEIGHT_TIER", 1299]]);

  const { status, session } = await call("createCheckoutSession", { ...body, selectedShippingService: "FIXED_WEIGHT_TIER" });
  assert.equal(status, 200);
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_CA_SHIPPING_8OZ_RATE_ID" }]);
  assert.deepEqual(session.shipping_address_collection.allowed_countries, ["CA"]);
  assert.equal(session.metadata.shipping_mode, "fixed_fallback");
  assert.equal(easypostCalls.length, 0);
});

test("6. International → current fixed tier, EasyPost not called", async () => {
  const body = { cartItems: cart([BOOK, 2]), shippingRegion: "INTL", destination: { country: "GB", postalCode: "SW1A 1AA" } };
  const { status, session } = await call("createCheckoutSession", body);
  assert.equal(status, 200);
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_INTL_SHIPPING_16OZ_RATE_ID" }]);
  assert.equal(easypostCalls.length, 0);
});

test("legacy CA / INTL requests without a destination still work", async () => {
  const { status, session } = await call("createCheckoutSession", { cartItems: cart([BOOK, 1]), shippingRegion: "INTL" });
  assert.equal(status, 200);
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_INTL_SHIPPING_8OZ_RATE_ID" }]);
});

test("7. missing EASYPOST_API_KEY → fixed US fallback, checkout still works", async () => {
  delete process.env.EASYPOST_API_KEY;
  const q = await quote(cart([BOOK, 1]));
  assert.equal(q.json.liveRates, false);
  assert.deepEqual(q.json.options.map((o) => [o.code, o.amountCents]), [["FIXED_STANDARD", 499]]);

  const { status, session } = await checkout(cart([BOOK, 1]), { selectedShippingService: "FIXED_STANDARD" });
  assert.equal(status, 200);
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
  assert.equal(session.metadata.shipping_mode, "fixed_fallback");
  assert.match(session.metadata.live_rate_unavailable_reason, /EASYPOST_API_KEY/);
  assert.equal(easypostCalls.length, 0);
});

test("missing package dimensions → fixed US fallback, ZIP not required (current behavior)", async () => {
  Object.assign(PACKAGE_DIMENSIONS.parcel, { lengthIn: null });
  const { status, session } = await call("createCheckoutSession", { cartItems: cart([BOOK, 1]), shippingRegion: "US" });
  assert.equal(status, 200);
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
  assert.match(session.metadata.live_rate_unavailable_reason, /PACKAGE_DIMENSIONS\.parcel\.lengthIn/);
});

test("8. EasyPost error → fixed fallback; a chosen live service maps to the fixed rate", async () => {
  easypostFails = true;
  const q = await quote(cart([BOOK, 1]));
  assert.deepEqual(q.json.options.map((o) => o.code), ["FIXED_STANDARD"]);

  const { status, session } = await checkout(cart([BOOK, 1]), { selectedShippingService: "GroundAdvantage" });
  assert.equal(status, 200);
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
  assert.equal(session.metadata.shipping_mode, "fixed_fallback");
  assert.match(session.metadata.live_rate_unavailable_reason, /EasyPost error/);
});

test("EasyPost error at $65+ → existing free Stripe rate", async () => {
  easypostFails = true;
  const { session } = await checkout(cart([BUNDLE, 1]), { selectedShippingService: "GroundAdvantage" });
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_FREE_SHIPPING_RATE_ID" }]);
  assert.equal(session.metadata.free_us_shipping, "true");
});

test("9. destination / region mismatch rejected on quote and checkout", async () => {
  const mismatches = [
    ["US", { country: "CA", postalCode: "K1A 0B1" }],
    ["CA", { country: "US", postalCode: "10001" }],
    ["INTL", { country: "US", postalCode: "10001" }],
    ["INTL", { country: "CA", postalCode: "K1A 0B1" }],
  ];
  for (const [shippingRegion, destination] of mismatches) {
    for (const fn of ["getShippingOptions", "createCheckoutSession"]) {
      const { status } = await call(fn, { cartItems: cart([BOOK, 1]), shippingRegion, destination });
      assert.equal(status, 400, `${fn} ${shippingRegion}/${destination.country}`);
    }
  }
  assert.equal(sessions.length, 0);
});

test("US with live rating ready but no ZIP → asked for ZIP, no session", async () => {
  const { status, json } = await call("createCheckoutSession", { cartItems: cart([BOOK, 1]), shippingRegion: "US" });
  assert.equal(status, 400);
  assert.match(json.error, /ZIP code/);
  assert.equal(sessions.length, 0);
});

test("10. frontend shipping amounts and item prices are ignored", async () => {
  const items = [{ id: BOOK, quantity: 1, name: "x", price: 0.01, shippingCost: 0 }];
  const { status, session } = await checkout(items, {
    selectedShippingService: "Priority",
    shippingAmount: 1,
    shippingAmountCents: 1,
    shippingCost: 0,
    amountCents: 0,
    freeShipping: true,
    weightOz: 0.1,
  });
  assert.equal(status, 200);
  assert.deepEqual(session.line_items, [{ price: BOOK, quantity: 1 }]);
  const data = session.shipping_options[0].shipping_rate_data;
  assert.equal(data.fixed_amount.amount, 1040);
  assert.equal(session.metadata.free_us_shipping, "false");
  assert.equal(session.metadata.shipment_weight_oz, "6");
});

test("11. chosen Ground Advantage is re-rated server-side before Stripe", async () => {
  await quote(cart([BOOK, 1]));
  assert.equal(easypostCalls.length, 1);

  const { status, session } = await checkout(cart([BOOK, 1]), { selectedShippingService: "GroundAdvantage" });
  assert.equal(status, 200);
  assert.equal(easypostCalls.length, 2);
  assert.equal(session.shipping_options.length, 1);
  assert.deepEqual(session.shipping_options[0], {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 582, currency: "usd" },
      display_name: "USPS Ground Advantage",
      metadata: { shipping_service: "GroundAdvantage", shipping_mode: "live_usps" },
      delivery_estimate: {
        minimum: { unit: "business_day", value: 2 },
        maximum: { unit: "business_day", value: 5 },
      },
    },
  });
  assert.equal(session.metadata.shipping_mode, "live_usps");
  assert.equal(session.metadata.shipping_service, "GroundAdvantage");
  assert.equal(session.metadata.shipping_amount_cents, "582");
  assert.equal(session.metadata.quoted_postal_code, "10001");
});

test("12. carrier rate changed between quote and checkout → newest rate used", async () => {
  const q = await quote(cart([BOOK, 1]));
  assert.equal(q.json.options[0].amountCents, 582);

  easypostRates = usps("6.40", "11.00", "32.00");
  const { session } = await checkout(cart([BOOK, 1]), { selectedShippingService: "GroundAdvantage" });
  assert.equal(session.shipping_options[0].shipping_rate_data.fixed_amount.amount, 640);
});

test("13. chosen service no longer available → clean 400, no session", async () => {
  easypostRates = usps("5.82", "10.40", null); // Express gone
  const { status, json } = await checkout(cart([BOOK, 1]), { selectedShippingService: "Express" });
  assert.equal(status, 400);
  assert.match(json.error, /refresh shipping options/);
  assert.equal(sessions.length, 0);

  const letter = await checkout(cart([STICKER, 4]), { selectedShippingService: "UNTRACKED_LETTER" }); // 4 oz
  assert.equal(letter.status, 400);

  const fixedWhileLive = await checkout(cart([BOOK, 1]), { selectedShippingService: "FIXED_STANDARD" });
  assert.equal(fixedWhileLive.status, 400);
});

test("14. US $65+ → Ground Advantage $0 in quote and in Stripe", async () => {
  const q = await quote(cart([BUNDLE, 1]));
  const ga = q.json.options.find((o) => o.code === "GroundAdvantage");
  assert.equal(ga.amountCents, 0);
  assert.equal(ga.isFree, true);

  const { session } = await checkout(cart([BUNDLE, 1]), { selectedShippingService: "GroundAdvantage" });
  const data = session.shipping_options[0].shipping_rate_data;
  assert.equal(data.fixed_amount.amount, 0);
  assert.equal(data.display_name, "USPS Ground Advantage");
  assert.equal(session.metadata.free_us_shipping, "true");
});

test("15. US $65+ with Priority chosen → Priority stays paid", async () => {
  const { session } = await checkout(cart([BUNDLE, 1]), { selectedShippingService: "Priority" });
  assert.equal(session.shipping_options[0].shipping_rate_data.fixed_amount.amount, 1040);
  assert.equal(session.metadata.free_us_shipping, "false");
});

test("no service chosen → all live services offered in Stripe, cheapest first", async () => {
  const { session } = await checkout(cart([BOOK, 1]));
  assert.deepEqual(
    session.shipping_options.map((o) => o.shipping_rate_data.fixed_amount.amount),
    [582, 1040, 3150]
  );
  assert.equal(session.metadata.shipping_service, "customer_choice_at_checkout");
});

test("16. unknown product → safe 400 rejection", async () => {
  for (const fn of ["getShippingOptions", "createCheckoutSession"]) {
    const { status, json } = await call(fn, { cartItems: cart([UNMAPPED, 1]), shippingRegion: "US", destination: US_DEST });
    assert.equal(status, 400);
    assert.match(json.error, /contact us/i);
  }
  assert.equal(sessions.length, 0);
});

test("17+18. Archive Buy Now: parcel class, live US rating on product weight only", async () => {
  const { status, session } = await call("createArchiveCheckout", {
    selectedYear: "2026",
    selectedMonths: ["January", "February", "March"],
    shippingRegion: "US",
    destination: US_DEST,
    selectedShippingService: "Priority",
  });
  assert.equal(status, 200);
  assert.equal(session.metadata.shipment_class, "parcel");
  assert.equal(session.metadata.product_type, "kahani_times_archive");
  assert.equal(easypostCalls[0].params.parcel.weight, 3); // 3 × 1 oz, nothing added
  assert.equal(session.shipping_options[0].shipping_rate_data.display_name, "USPS Priority Mail");
});

test("archive in the cart quote endpoint → parcel rating", async () => {
  const { status } = await quote([
    { productType: "kahani_times_archive", selectedYear: "2026", selectedMonths: ["January"] },
    { id: STICKER, quantity: 1 },
  ]);
  assert.equal(status, 200);
  assert.equal(easypostCalls[0].params.parcel.weight, 2); // 1 + 1 (parcel class, not flat)
  assert.equal(easypostCalls[0].params.parcel.length, 10); // parcel box, not flat envelope
});

test("19. quantity multiplication reaches the rating request", async () => {
  await quote(cart([BOOK, 3], [STICKER, 2]));
  assert.equal(easypostCalls[0].params.parcel.weight, 20); // 3 × 6 + 2 × 1
});

test("20. malformed postal code / country rejected before any rating", async () => {
  const bad = [
    { country: "US", postalCode: "1234" },
    { country: "US", postalCode: "ABCDE" },
    { country: "ZZZ", postalCode: "10001" },
    { country: "US" },
    "10001",
  ];
  for (const destination of bad) {
    const { status } = await call("getShippingOptions", { cartItems: cart([BOOK, 1]), shippingRegion: "US", destination });
    assert.equal(status, 400, JSON.stringify(destination));
  }
  assert.equal(easypostCalls.length, 0);
});

test("abuse limits: oversized payload, huge quantity, too many lines", async () => {
  const huge = await call("getShippingOptions", { cartItems: cart([BOOK, 1]), junk: "x".repeat(40000) });
  assert.equal(huge.status, 413);

  const qty = await quote(cart([BOOK, 51]));
  assert.equal(qty.status, 400);

  const lines = await quote(Array.from({ length: 31 }, () => ({ id: BOOK, quantity: 1 })));
  assert.equal(lines.status, 400);
  assert.equal(easypostCalls.length, 0);
});

// ── Service choice on Stripe Checkout (frontend sends only cart + region + destination) ──

const stripeOptions = (session) =>
  session.shipping_options.map((o) =>
    o.shipping_rate
      ? [o.shipping_rate, null]
      : [o.shipping_rate_data.display_name, o.shipping_rate_data.fixed_amount.amount]
  );

test("Stripe flow: US parcel → Ground Advantage / Priority / Express all offered on Stripe", async () => {
  const { status, session } = await checkout(cart([BOOK, 2]));
  assert.equal(status, 200);
  assert.deepEqual(stripeOptions(session), [
    ["USPS Ground Advantage", 582],
    ["USPS Priority Mail", 1040],
    ["USPS Priority Mail Express", 3150],
  ]);
  assert.equal(session.metadata.shipping_mode, "live_usps");
});

test("Stripe flow: US $65+ → Ground Advantage FREE, Priority / Express paid", async () => {
  const { session } = await checkout(cart([BUNDLE, 1]));
  assert.deepEqual(stripeOptions(session), [
    ["USPS Ground Advantage", 0],
    ["USPS Priority Mail", 1040],
    ["USPS Priority Mail Express", 3150],
  ]);
  assert.equal(session.metadata.free_us_shipping, "true");
});

// Stamped letter mail works today without EasyPost.
const noEasyPost = () => delete process.env.EASYPOST_API_KEY;

test("Stripe flow (no EasyPost): 1 / 2 / 3 oz sticker carts → Untracked Letter Mail $0.82 / $1.11 / $1.40", async () => {
  noEasyPost();
  const STICKER_2 = "price_1Tb6DjP4FFhr5UNApKWkP5wA";
  const STICKER_3 = "price_1SvrPwP4FFhr5UNAhWnlzbu5";
  Object.assign(STRIPE_PRICES, { [STICKER_2]: 499, [STICKER_3]: 999 });

  const cases = [
    [cart([STICKER, 1]), 82],
    [cart([STICKER, 1], [STICKER_2, 1]), 111],
    [cart([STICKER, 1], [STICKER_2, 1], [STICKER_3, 1]), 140],
  ];
  for (const [items, cents] of cases) {
    const { status, session } = await checkout(items);
    assert.equal(status, 200);
    assert.deepEqual(stripeOptions(session), [["Untracked Letter Mail", cents]]);
    assert.equal(session.metadata.shipping_mode, "untracked_letter");
    assert.equal(session.metadata.shipment_class, "flat");
  }
});

test("Stripe flow (no EasyPost): 4 oz sticker cart → $4.99 parcel fallback, no letter mail", async () => {
  noEasyPost();
  const { session } = await checkout(cart([STICKER, 4]));
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
  assert.equal(session.metadata.shipment_weight_oz, "4");
});

test("Stripe flow (no EasyPost): sticker + book → $4.99 parcel fallback", async () => {
  noEasyPost();
  const { session } = await checkout(cart([STICKER, 1], [BOOK, 1]));
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
  assert.equal(session.metadata.shipment_class, "parcel");
});

test("Stripe flow: US $65+ sticker-only cart → free shipping, no letter postage", async () => {
  const saved = STRIPE_PRICES[STICKER];
  STRIPE_PRICES[STICKER] = 6500; // make a 1 oz flat cart reach the threshold
  try {
    noEasyPost();
    const fixed = await checkout(cart([STICKER, 1]));
    assert.deepEqual(fixed.session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_FREE_SHIPPING_RATE_ID" }]);
    assert.equal(fixed.session.metadata.free_us_shipping, "true");

    Object.assign(process.env, LIVE_ENV);
    const live = await checkout(cart([STICKER, 1]));
    assert.ok(!stripeOptions(live.session).some(([name]) => /Letter/.test(name)));
    assert.equal(stripeOptions(live.session)[0][1], 0);
  } finally {
    STRIPE_PRICES[STICKER] = saved;
  }
});

test("Stripe flow (EasyPost live): 1 oz sticker → letter $0.82 plus USPS services", async () => {
  const { session } = await checkout(cart([STICKER, 1]));
  assert.deepEqual(stripeOptions(session), [
    ["Untracked Letter Mail", 82],
    ["USPS Ground Advantage", 582],
    ["USPS Priority Mail", 1040],
    ["USPS Priority Mail Express", 3150],
  ]);
});

test("14+15. frontend fake weight, class and shipping amount are ignored", async () => {
  noEasyPost();
  // A book dressed up as a 0.1 oz flat item with a 1¢ shipping price.
  const book = [{ id: BOOK, quantity: 1, name: "x", price: 0.01, weightOz: 0.1, shippingClass: "flat", shippingAmountCents: 1 }];
  const asBook = await checkout(book, { weightOz: 0.1, totalWeightOz: 0.1, shippingAmountCents: 1, amountCents: 1, shippingCost: 0 });
  assert.deepEqual(asBook.session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
  assert.equal(asBook.session.metadata.shipment_weight_oz, "6");
  assert.equal(asBook.session.metadata.shipment_class, "parcel");

  // Four stickers claiming 1 oz total still weigh 4 oz → no letter mail.
  const stickers = [{ id: STICKER, quantity: 4, weightOz: 0.25, price: 0.01 }];
  const heavy = await checkout(stickers, { weightOz: 1, shippingAmountCents: 82 });
  assert.deepEqual(heavy.session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);

  // A 1 oz sticker claiming a $0 / 1¢ letter price still pays the trusted $0.82.
  const one = await checkout([{ id: STICKER, quantity: 1, price: 0.01, shippingAmountCents: 0 }], { amountCents: 1, shippingAmount: 0 });
  assert.deepEqual(stripeOptions(one.session), [["Untracked Letter Mail", 82]]);
});

test("Stripe flow: no EasyPost key → existing $4.99 / free Stripe rates, no API error shown", async () => {
  delete process.env.EASYPOST_API_KEY;
  const under = await checkout(cart([BOOK, 1]));
  assert.equal(under.status, 200);
  assert.deepEqual(under.session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);

  const over = await checkout(cart([BUNDLE, 1]));
  assert.deepEqual(over.session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_FREE_SHIPPING_RATE_ID" }]);
});

test("Stripe flow: EasyPost failure → fixed fallback, customer never sees the API error", async () => {
  easypostFails = true;
  const { status, json, session } = await checkout(cart([BOOK, 1]));
  assert.equal(status, 200);
  assert.deepEqual(json, { url: "https://checkout.test/session" });
  assert.deepEqual(session.shipping_options, [{ shipping_rate: "shr_STRIPE_US_STANDARD_SHIPPING_RATE_ID" }]);
});

test("Stripe flow: Archive Buy Now without a service code → all live services on Stripe", async () => {
  const { status, session } = await call("createArchiveCheckout", {
    selectedYear: "2026",
    selectedMonths: ["January"],
    shippingRegion: "US",
    destination: US_DEST,
  });
  assert.equal(status, 200);
  assert.equal(session.shipping_options.length, 3);
  assert.equal(session.metadata.shipment_class, "parcel");
});
