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

// Your real Variant ID
const VARIANT_GID = "gid://shopify/ProductVariant/47227579760817";

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

// Bumped to v10!
app.get("/health", (_req, res) => {
  res.json({ ok: true, version: "draft-order-checkout-v10" });
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
              id
              name
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
          // 1. We must include an email so it's not a "ghost" order
          email: "booking@dependablediamondtransportation.com",
          note: "Generated via Web Calculator",
          lineItems: [
            {
              // 2. We use your real product variant
              variantId: VARIANT_GID,
              originalUnitPrice: total.toFixed(2),
              quantity: 1
            }
          ],
          // 3. We ONLY include a Billing Address to satisfy Shopify Payments.
          // NO Shipping Address, because this is a service/non-physical product!
          billingAddress: {
            address1: "123 Main St",
            city: "Los Angeles",
            provinceCode: "CA",
            countryCode: "US",
            zip: "90001"
          }
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
    const orderName = data.data.draftOrderCreate.draftOrder.name;

    console.log(`=== DRAFT ORDER CREATED: ${orderName} | $${total.toFixed(2)} ===`);
    
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