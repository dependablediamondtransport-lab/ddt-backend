const express = require("express");
const cors = require("cors");

const app = express();

const corsOptions = {
  origin: [
    "https://dependablediamondtransportation.com",
    "https://www.dependablediamondtransportation.com"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));
app.use(express.json());

const SHOP = process.env.SHOPIFY_SHOP || "dependable-diamond-transportation.myshopify.com";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "bea1ff6b2c72a4ff8eef7e6c3b7886ca";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "PASTE_YOUR_SECRET_HERE";
const PORT = process.env.PORT || 3000;

async function getAccessToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
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
  res.json({ ok: true });
});

app.post("/create-checkout", async (req, res) => {
  try {
    const body = req.body || {};
    const total = Number(body.total || 0);
    const email = String(body.email || "").trim();

    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid total." });
    }

    if (!email) {
      return res.status(400).json({ error: "Customer email is required." });
    }

    const accessToken = await getAccessToken();

    const query = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        email,
        note: "Created by DDT calculator",
        lineItems: [
          {
            title: "DDT Transportation Service",
            quantity: 1,
            originalUnitPriceWithCurrency: {
              amount: total.toFixed(2),
              currencyCode: "USD"
            }
          }
        ]
      }
    };

    console.log("=== CREATE CHECKOUT REQUEST ===");
    console.log(JSON.stringify(variables, null, 2));

    const gqlRes = await fetch(`https://${SHOP}/admin/api/2026-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query, variables })
    });

    const gqlText = await gqlRes.text();

    console.log("=== SHOPIFY RAW RESPONSE ===");
    console.log(gqlText);

    let gqlData = {};
    try {
      gqlData = JSON.parse(gqlText);
    } catch {
      throw new Error(`GraphQL response was not JSON: ${gqlText}`);
    }

    const topErrors = gqlData.errors || [];
    const userErrors = gqlData?.data?.draftOrderCreate?.userErrors || [];
    const invoiceUrl = gqlData?.data?.draftOrderCreate?.draftOrder?.invoiceUrl;

    if (topErrors.length) {
      return res.status(400).json({ error: topErrors[0].message || "GraphQL error." });
    }

    if (userErrors.length) {
      return res.status(400).json({ error: userErrors[0].message || "Draft order creation failed." });
    }

    if (!invoiceUrl) {
      return res.status(500).json({ error: "No invoice URL returned." });
    }

    return res.json({ invoiceUrl });
  } catch (error) {
    console.error("create-checkout error:", error);
    return res.status(500).json({ error: error.message || "Server error creating checkout." });
  }
});

app.listen(PORT, () => {
  console.log(`DDT backend running on port ${PORT}`);
});