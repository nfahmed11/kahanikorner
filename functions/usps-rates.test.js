// Tests for usps-rates.js with a mocked EasyPost client (no network).
// Run: node --test functions/usps-rates.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const { PACKAGE_DIMENSIONS, calculateShipmentProfile } = require("./shipping");
const {
  getLiveRatingReadiness,
  normalizeUspsRates,
  fetchUspsRates,
} = require("./usps-rates");

const BOOK = "price_1TbIF6P4FFhr5UNAXn6meNvr"; // 6 oz, parcel
const ENV = {
  EASYPOST_API_KEY: "EZTK_test_secret_value",
  SHIP_FROM_NAME: "Kahani Korner",
  SHIP_FROM_STREET1: "1 Test St",
  SHIP_FROM_CITY: "Testville",
  SHIP_FROM_STATE: "TX",
  SHIP_FROM_ZIP: "75001",
  SHIP_FROM_COUNTRY: "US",
};
const DEST = { country: "US", postalCode: "10001" };

const RAW_RATES = [
  { carrier: "USPS", service: "GroundAdvantage", rate: "5.82", currency: "USD", delivery_days: 4 },
  { carrier: "USPS", service: "Priority", rate: "10.40", currency: "USD", delivery_days: 2 },
  { carrier: "USPS", service: "Express", rate: "31.50", currency: "USD", delivery_days: 1 },
  { carrier: "USPS", service: "MediaMail", rate: "3.50", currency: "USD" },
  { carrier: "UPS", service: "Ground", rate: "9.00", currency: "USD" },
  { carrier: "FedEx", service: "FEDEX_GROUND", rate: "8.00", currency: "USD" },
  { carrier: "UPS", service: "Priority", rate: "1.00", currency: "USD" }, // name clash, wrong carrier
];

const profile = (qty = 1) => calculateShipmentProfile([{ price: BOOK, quantity: qty }], "");

function withParcelDims(fn) {
  const saved = { ...PACKAGE_DIMENSIONS.parcel };
  Object.assign(PACKAGE_DIMENSIONS.parcel, { lengthIn: 10, widthIn: 8, heightIn: 2 });
  return Promise.resolve()
    .then(fn)
    .finally(() => Object.assign(PACKAGE_DIMENSIONS.parcel, saved));
}

function mockClient(behavior) {
  const calls = [];
  const createClient = (apiKey, options) => ({
    Shipment: {
      create: async (params) => {
        calls.push({ apiKey, options, params });
        return behavior(params);
      },
    },
  });
  return { calls, createClient };
}

test("normalize: only USPS Ground Advantage / Priority / Express survive", () => {
  const rates = normalizeUspsRates(RAW_RATES);
  assert.deepEqual(rates.map((r) => r.serviceCode), ["GroundAdvantage", "Priority", "Express"]);
  assert.deepEqual(rates[0], {
    provider: "USPS",
    serviceCode: "GroundAdvantage",
    displayName: "USPS Ground Advantage",
    amountCents: 582,
    currency: "usd",
    estimatedDays: 4,
  });
});

test("normalize: bad amounts / currencies dropped, cheapest duplicate kept", () => {
  const rates = normalizeUspsRates([
    { carrier: "USPS", service: "Priority", rate: "abc", currency: "USD" },
    { carrier: "USPS", service: "Priority", rate: "-1", currency: "USD" },
    { carrier: "USPS", service: "Express", rate: "20.00", currency: "CAD" },
    { carrier: "USPS", service: "GroundAdvantage", rate: "7.00", currency: "USD" },
    { carrier: "USPS", service: "GroundAdvantage", rate: "6.10", currency: "USD" },
    null,
  ]);
  assert.deepEqual(rates.map((r) => [r.serviceCode, r.amountCents]), [["GroundAdvantage", 610]]);
  assert.deepEqual(normalizeUspsRates(undefined), []);
});

test("readiness: missing key / origin / package dims → not ready, reason names them", () => {
  const r1 = getLiveRatingReadiness(profile(), {});
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /EASYPOST_API_KEY/);
  assert.match(r1.reason, /SHIP_FROM_STREET1/);
  assert.match(r1.reason, /PACKAGE_DIMENSIONS\.parcel\.lengthIn/);

  return withParcelDims(() => {
    assert.equal(getLiveRatingReadiness(profile(), ENV).ok, true);
    assert.equal(getLiveRatingReadiness(profile(), { ...ENV, SHIP_FROM_COUNTRY: "CA" }).ok, false);
  });
});

test("missing EASYPOST_API_KEY → fallback reason, EasyPost never called", async () => {
  await withParcelDims(async () => {
    const { calls, createClient } = mockClient(() => ({ rates: RAW_RATES }));
    const { EASYPOST_API_KEY, ...noKey } = ENV;
    const result = await fetchUspsRates({ shipmentProfile: profile(), destination: DEST, env: noKey, createClient });
    assert.equal(result.ok, false);
    assert.match(result.reason, /EASYPOST_API_KEY/);
    assert.equal(calls.length, 0);
  });
});

test("EasyPost error → fallback reason, API key never leaks into it", async () => {
  await withParcelDims(async () => {
    const { createClient } = mockClient(() => {
      throw new Error(`Unauthorized for key ${ENV.EASYPOST_API_KEY}`);
    });
    const result = await fetchUspsRates({ shipmentProfile: profile(), destination: DEST, env: ENV, createClient });
    assert.equal(result.ok, false);
    assert.match(result.reason, /EasyPost error/);
    assert.ok(!result.reason.includes(ENV.EASYPOST_API_KEY));
  });
});

test("EasyPost timeout → fallback reason", async () => {
  await withParcelDims(async () => {
    const { createClient } = mockClient(() => new Promise(() => {}));
    const result = await fetchUspsRates({ shipmentProfile: profile(), destination: DEST, env: ENV, createClient, timeoutMs: 30 });
    assert.equal(result.ok, false);
    assert.match(result.reason, /timed out/);
  });
});

test("no approved USPS rate → fallback reason", async () => {
  await withParcelDims(async () => {
    const { createClient } = mockClient(() => ({ rates: RAW_RATES.slice(3) }));
    const result = await fetchUspsRates({ shipmentProfile: profile(), destination: DEST, env: ENV, createClient });
    assert.equal(result.ok, false);
    assert.match(result.reason, /no approved USPS rates/);
  });
});

test("non-US destination is never live-rated in this phase", async () => {
  await withParcelDims(async () => {
    const { calls, createClient } = mockClient(() => ({ rates: RAW_RATES }));
    const result = await fetchUspsRates({ shipmentProfile: profile(), destination: { country: "CA", postalCode: "K1A 0B1" }, env: ENV, createClient });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });
});

test("rating request: trusted origin, customer ZIP only, weight = product weight × quantity, no packaging", async () => {
  await withParcelDims(async () => {
    const { calls, createClient } = mockClient(() => ({ rates: RAW_RATES }));
    const result = await fetchUspsRates({ shipmentProfile: profile(3), destination: DEST, env: ENV, createClient });
    assert.equal(result.ok, true);
    assert.deepEqual(result.rates.map((r) => r.serviceCode), ["GroundAdvantage", "Priority", "Express"]);

    const { apiKey, params } = calls[0];
    assert.equal(apiKey, ENV.EASYPOST_API_KEY);
    assert.deepEqual(params.to_address, { zip: "10001", country: "US" });
    assert.equal(params.from_address.street1, "1 Test St");
    assert.equal(params.from_address.country, "US");
    assert.deepEqual(params.parcel, { weight: 18, length: 10, width: 8, height: 2 }); // 3 × 6 oz
    assert.equal(params.carrier_accounts, undefined);
  });
});

test("optional EASYPOST_USPS_CARRIER_ACCOUNT_ID limits the request to that account", async () => {
  await withParcelDims(async () => {
    const { calls, createClient } = mockClient(() => ({ rates: RAW_RATES }));
    await fetchUspsRates({
      shipmentProfile: profile(),
      destination: DEST,
      env: { ...ENV, EASYPOST_USPS_CARRIER_ACCOUNT_ID: "ca_usps123" },
      createClient,
    });
    assert.deepEqual(calls[0].params.carrier_accounts, ["ca_usps123"]);
  });
});
