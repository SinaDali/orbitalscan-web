// netlify/functions/payment-webhook.js
/**
 * OrbitalScan — Payment Webhook (Blobs-enabled)
 *
 * Flow:
 *  - Verify webhook secret (X-Helio-Signature === HELIO_WEBHOOK_SECRET)
 *  - Parse payload
 *  - Compute membership expiry based on plan
 *  - Persist membership to Netlify Blobs (store: "members")
 */

import { getStore } from "@netlify/blobs";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 1) Verify secret
    const secret = process.env.HELIO_WEBHOOK_SECRET;
    const signature = event.headers["x-helio-signature"] || event.headers["X-Helio-Signature"];
    if (!secret) return { statusCode: 500, body: "Server misconfigured" };
    if (!signature || signature !== secret) return { statusCode: 401, body: "Unauthorized" };

    // 2) Parse payload
    const payload = JSON.parse(event.body || "{}");
    if (payload.event !== "payment_succeeded") {
      return json(200, { ok: true, ignored: true });
    }

    const plan = String(payload.plan || "").toLowerCase(); // monthly | yearly
    const email = (payload.email || "").trim().toLowerCase();
    const wallet = (payload.wallet || "").trim();

    if (!["monthly", "yearly"].includes(plan)) {
      return json(400, { ok: false, error: "Invalid plan" });
    }
    if (!email && !wallet) {
      return json(400, { ok: false, error: "Email or wallet required" });
    }

    // 3) Compute expiry
    const now = new Date();
    const startISO = now.toISOString();
    const expires = new Date(now);
    if (plan === "monthly") expires.setMonth(expires.getMonth() + 1);
    if (plan === "yearly") expires.setFullYear(expires.getFullYear() + 1);
    const expiryISO = expires.toISOString();

    // 4) Build record
    const member = {
      email: email || null,
      wallet: wallet || null,
      plan,
      amount: payload.amount || null,
      currency: payload.currency || null,
      txHash: payload.txHash || null,
      started_at: startISO,
      expires_at: expiryISO,
      provider: "helio",
      status: "active"
    };

    // 5) Persist to Netlify Blobs
    const store = getStore({ name: "members", consistency: "strong" });
    const key = email ? `email:${email}` : `wallet:${wallet.toLowerCase()}`;
    await store.setJSON(key, member);

    return json(200, { ok: true, saved: true, key, expires_at: expiryISO });
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
