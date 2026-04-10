const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const SHOP = "dependable-diamond-transportation.myshopify.com";
const CLIENT_ID = "bea1ff6b2c72a4ff8eef7e6c3b7886ca";
const CLIENT_SECRET = "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";

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

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(JSON.stringify(data));
  }

  return data.access_token;
}

app.post("/create-checkout", async (req, res) => {
  try {
    const body = req.body;
    const total = Number(body.total || 0);

    if (!total || total <= 0) {
      return res.status(400).json({ error: "Invalid total" });
    }

    const token = await getAccessToken();

    const response = await fetch(`https://${SHOP}/admin/api/2026-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({
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
            tags: ["DDT Calculator"],
            note: JSON.stringify(body),
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
        }
      })
    });

    const data = await response.json();

    const error = data?.data?.draftOrderCreate?.userErrors?.[0]?.message;
    const url = data?.data?.draftOrderCreate?.draftOrder?.invoiceUrl;

    if (error) {
      return res.status(400).json({ error });
    }

    if (!url) {
      return res.status(500).json({ error: "No invoice URL" });
    }

    res.json({ invoiceUrl: url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});