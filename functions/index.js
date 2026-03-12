const functions = require("firebase-functions");
const stripe = require("stripe");

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