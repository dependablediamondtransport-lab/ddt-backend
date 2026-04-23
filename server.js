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

async function shopifyGraphql(accessToken, query, variables) {
  const response = await fetch(`https://${SHOP}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const text = await response.text();

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GraphQL response was not JSON: ${text}`);
  }

  return data;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, version: "ddt-backend-invoice-send-v1" });
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

    const createDraftMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            ready
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createVariables = {
      input: {
        email,
        note: [
          "Created by DDT calculator",
          `Customer Email: ${email}`,
          `Trip Type: ${body.tripType || ""}`,
          `Leg A Miles: ${body.milesA ?? 0}`,
          `Leg A Wait Time: ${body.waitA ?? 0}`,
          `Leg A Deadhead: ${body.deadA ?? 0}`,
          `Leg B Miles: ${body.milesB ?? 0}`,
          `Leg B Wait Time: ${body.waitB ?? 0}`,
          `Leg B Deadhead: ${body.deadB ?? 0}`,
          `Wheelchair Rental A: ${body.wheelchairRentalA ? "Yes" : "No"}`,
          `Wheelchair Rental B: ${body.wheelchairRentalB ? "Yes" : "No"}`,
          `OC Surcharge: ${body.ocSurcharge ?? 0}`,
          `LA Surcharge: ${body.laSurcharge ?? 0}`,
          `Holiday: ${body.holiday ? "Yes" : "No"}`,
          `Weekend: ${body.weekend ? "Yes" : "No"}`,
          `Peak: ${body.peak ? "Yes" : "No"}`,
          `Extra Attendant: ${body.extraAttendant ? "Yes" : "No"}`,
          `Bariatric: ${body.bariatric ? "Yes" : "No"}`,
          `Quoted Total: $${total.toFixed(2)}`
        ].join("\n"),
     lineItems: [
  {
    variantId: "gid://shopify/ProductVariant/46752322879665",
    quantity: 1,
    originalUnitPriceWithCurrency: {
      amount: total.toFixed(2),
      currencyCode: "USD"
    }
  }
]
      }
    };

    console.log("=== CREATE DRAFT ORDER REQUEST ===");
    console.log(JSON.stringify(createVariables, null, 2));

    const createResult = await shopifyGraphql(accessToken, createDraftMutation, createVariables);

    console.log("=== CREATE DRAFT ORDER RESPONSE ===");
    console.log(JSON.stringify(createResult, null, 2));

    const createTopErrors = createResult.errors || [];
    const createUserErrors = createResult?.data?.draftOrderCreate?.userErrors || [];
    const draftOrder = createResult?.data?.draftOrderCreate?.draftOrder;

    if (createTopErrors.length) {
      return res.status(400).json({ error: createTopErrors[0].message || "GraphQL error creating draft order." });
    }

    if (createUserErrors.length) {
      return res.status(400).json({ error: createUserErrors[0].message || "Draft order creation failed." });
    }

    if (!draftOrder?.id || !draftOrder?.invoiceUrl) {
      return res.status(500).json({ error: "No invoice URL returned from draft order." });
    }

    const sendInvoiceMutation = `
      mutation draftOrderInvoiceSend($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder {
            id
            name
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const sendInvoiceVariables = {
      id: draftOrder.id,
      email: {
        to: email,
        subject: "Your Dependable Diamond Transportation checkout link",
        customMessage: "Please use the secure link to review and complete payment for your transportation service."
      }
    };

    console.log("=== SEND INVOICE REQUEST ===");
    console.log(JSON.stringify(sendInvoiceVariables, null, 2));

    const sendResult = await shopifyGraphql(accessToken, sendInvoiceMutation, sendInvoiceVariables);

    console.log("=== SEND INVOICE RESPONSE ===");
    console.log(JSON.stringify(sendResult, null, 2));

    const sendTopErrors = sendResult.errors || [];
    const sendUserErrors = sendResult?.data?.draftOrderInvoiceSend?.userErrors || [];

    if (sendTopErrors.length) {
      return res.status(400).json({ error: sendTopErrors[0].message || "GraphQL error sending invoice." });
    }

    if (sendUserErrors.length) {
      return res.status(400).json({ error: sendUserErrors[0].message || "Invoice send failed." });
    }

    await sleep(5000);

    return res.json({
      invoiceUrl: draftOrder.invoiceUrl,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      ready: draftOrder.ready
    });

  } catch (error) {
    console.error("create-checkout error:", error);
    return res.status(500).json({ error: error.message || "Server error creating checkout." });
  }
});

app.listen(PORT, () => {
  console.log(`DDT backend running on port ${PORT}`);
});