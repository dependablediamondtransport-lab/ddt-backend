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

// Bumped to v3 so you know when Render has finished updating!
app.get("/health", (_req, res) => {
  res.json({ ok: true, version: "draft-order-checkout-v3" });
});

app.post("/create-checkout", async (req, res) => {
  try {
    const body = req.body || {};
    const total = Number(body.total || 0);

    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid total." });
    }

    const accessToken = await getAccessToken();

    const graphqlQuery = {
      query: `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              invoiceUrl
            }
            userErrors {
              message
            }
          }
        }
      `,
      variables: {
        input: {
          lineItems: [
            {
              title: "Transportation Service",
              originalUnitPrice: total.toFixed(2),
              quantity: 1,
              requiresShipping: false
            }
          ]
        }
      }
    };

    const response = await fetch(`https://${SHOP}/admin/api/2026-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify(graphqlQuery)
    });

    const data = await response.json();

    const userErrors = data?.data?.draftOrderCreate?.userErrors || [];
    if (data.errors || userErrors.length > 0) {
      console.error("GraphQL Errors:", data.errors || userErrors);
      return res.status(400).json({ error: "Failed to create Draft Order." });
    }

    const checkoutUrl = data.data.draftOrderCreate.draftOrder.invoiceUrl;

    console.log(`=== DRAFT ORDER CREATED: $${total.toFixed(2)} ===`);

    return res.json({
      checkoutUrl,
      total: total.toFixed(2)
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