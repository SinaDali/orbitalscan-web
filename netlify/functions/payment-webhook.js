// netlify/functions/payment-webhook.js
/**
 * OrbitalScan — Payment Webhook (Placeholder)
 *
 * Purpose:
 * - Receive POST events from the crypto checkout provider (Helio or similar)
 * - Verify the webhook secret
 * - (Next steps) Mark the user as active in a datastore (Supabase / Netlify Blobs)
 *
 * Endpoint (after deploy): https://<your-site>/.netlify/functions/payment-webhook
 *
 * Required environment variable (set in Netlify > Site settings > Build & deploy > Environment):
 *   HELIO_WEBHOOK_SECRET=<secret-from-provider>
 */

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 1) Verify signature / secret (simple shared-secret check for now)
    const secret = process.env.HELIO_WEBHOOK_SECRET;
    const signature = event.headers["x-helio-signature"] || event.headers["X-Helio-Signature"];
    if (!secret) {
      console.warn("[Webhook] Missing HELIO_WEBHOOK_SECRET env var");
      return { statusCode: 500, body: "Server misconfigured" };
    }
    if (!signature || signature !== secret) {
      console.warn("[Webhook] Invalid or missing signature");
      return { statusCode: 401, body: "Unauthorized" };
    }

    // 2) Parse event body
    const payload = JSON.parse(event.body || "{}");

    // Expected minimal payload shape (we will refine later):
    // {
    //   "event": "payment_succeeded",
    //   "amount": 35,
    //   "currency": "USDT",
    //   "plan": "monthly" | "yearly",
    //   "email": "user@email.com",
    //   "wallet": "0x... or solana addr",
    //   "txHash": "0x....",
    //   "timestamp": 1712345678
    // }

    console.log("[Webhook] Received:", payload);

    if (payload.event !== "payment_succeeded") {
      // Ignore other events for now
      return json(200, { ok: true, ignored: true });
    }

    // 3) TODO: persist membership (phase 2)
    //    Option A: Netlify Blobs (serverless key-value)
    //    Option B: Supabase (Postgres + Auth)
    //    For now, we simply acknowledge success.
    //    We'll wire real persistence in the next step.

    // Demo response
    return json(200, {
      ok: true,
      received: true,
      plan: payload.plan || null,
      email: payload.email || null,
      wallet: payload.wallet || null,
      note: "Membership activation will be persisted in the next step."
    });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
}

function json(status, data) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}
