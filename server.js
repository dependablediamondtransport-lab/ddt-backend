const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: ["https://dependablediamondtransportation.com", "https://www.dependablediamondtransportation.com"],
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
  const data = await res.json();
  return data.access_token;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, version: "editable-email-v1" });
});

app.post("/create-checkout", async (req, res) => {
  try {
    const body = req.body || {};
    const total = Number(body.total || 0);
    const accessToken = await getAccessToken();

    const graphqlQuery = {
      query: `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder { invoiceUrl }
            userErrors { message }
          }
        }
      `,
      variables: {
        input: {
          // WE REMOVED THE EMAIL LINE HERE
          // This tells Shopify: "This is a guest checkout, let the person type their info."
          note: "Phone Quote - Web Calculator",
          lineItems: [{
            title: "Transportation Service",
            originalUnitPrice: total.toFixed(2),
            quantity: 1,
            requiresShipping: false 
          }]
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
    const checkoutUrl = data.data.draftOrderCreate.draftOrder.invoiceUrl;
    
    return res.json({ checkoutUrl, total: total.toFixed(2) });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));