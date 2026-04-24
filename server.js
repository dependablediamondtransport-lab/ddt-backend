const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: [
    "https://dependablediamondtransportation.com",
    "https://www.dependablediamondtransportation.com"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const PORT = process.env.PORT || 3000;

const VARIANT_ID = "47227579760817";
const CHECKOUT_DOMAIN = "https://dependablediamondtransportation.com";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAccessToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials"
    })
  });

  const text = await res.text();
  let data = {};

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Token response was not JSON: ${text}`);
  }

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || text || "Failed to get access token");
  }

  return data.access_token;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, version: "normal-cart-checkout-v1" });
});

app.post("/create-checkout", async (req, res) => {
  try {
    const body = req.body || {};
    const total = Number(body.total || 0);

    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid total." });
    }

    const accessToken = await getAccessToken();

    const updateRes = await fetch(`https://${SHOP}/admin/api/2026-04/variants/${VARIANT_ID}.json`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({
        variant: {
          id: Number(VARIANT_ID),
          price: total.toFixed(2),
          requires_shipping: false,
          taxable: false
        }
      })
    });

    const updateText = await updateRes.text();

    console.log("=== VARIANT UPDATE RESPONSE ===");
    console.log(updateText);

    if (!updateRes.ok) {
      return res.status(400).json({
        error: `Variant update failed: ${updateText}`
      });
    }

    await sleep(1500);

    const checkoutUrl =
      `${CHECKOUT_DOMAIN}/cart/clear?return_to=${encodeURIComponent(`/cart/${VARIANT_ID}:1`)}`;

    return res.json({
      checkoutUrl,
      total: total.toFixed(2),
      variantId: VARIANT_ID
    });

  } catch (error) {
    console.error("create-checkout error:", error);
    return res.status(500).json({
      error: error.message || "Server error creating checkout."
    });
  }
});

app.listen(PORT, () => {
  console.log(`DDT backend running on port ${PORT}`);
});