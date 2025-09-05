// netlify/functions/payment-webhook.js
/**
 * OrbitalScan — Payment Webhook (Supabase)
 *
 * Flow:
 *  - Verify webhook secret (X-Helio-Signature === HELIO_WEBHOOK_SECRET)
 *  - Parse payload (plan/email/wallet/amount/currency/txHash)
 *  - Ensure user (via Supabase RPC: ensure_user)
 *  - Insert active subscription with computed expiry
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

function json(status, data) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 1) Verify webhook shared secret
    const expected = process.env.HELIO_WEBHOOK_SECRET;
    const signature = event.headers["x-helio-signature"] || event.headers["X-Helio-Signature"];
    if (!expected) return json(500, { ok: false, error: "Missing HELIO_WEBHOOK_SECRET" });
    if (!signature || signature !== expected) return json(401, { ok: false, error: "Unauthorized" });

    // 2) Parse payload
    const payload = JSON.parse(event.body || "{}");

    if (payload.event !== "payment_succeeded") {
      return json(200, { ok: true, ignored: true });
    }

    const plan = String(payload.plan || "").toLowerCase(); // monthly | yearly
    const email = (payload.email || "").trim().toLowerCase() || null;
    const wallet = (payload.wallet || "").trim() || null;
    const amount = Number(payload.amount || 0);
    const currency = (payload.currency || "USDT").toUpperCase();
    const txHash = payload.txHash || null;

    if (!["monthly", "yearly"].includes(plan)) return json(400, { ok:false, error:"Invalid plan" });
    if (!email && !wallet) return json(400, { ok:false, error:"email or wallet required" });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return json(500, { ok:false, error:"Supabase env not set" });

    // 3) Supabase client (service role)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // 4) Ensure user (RPC ensure_user from schema)
    const { data: ensureData, error: ensureErr } = await supabase
      .rpc("ensure_user", { _email: email, _wallet: wallet });

    if (ensureErr) {
      console.error("[ensure_user] error:", ensureErr);
      return json(500, { ok:false, error:"ensure_user failed" });
    }

    const user_id = ensureData;

    // 5) Compute expiry
    const now = new Date();
    const expires = new Date(now);
    if (plan === "monthly") expires.setMonth(expires.getMonth() + 1);
    if (plan === "yearly")  expires.setFullYear(expires.getFullYear() + 1);

    // 6) Insert subscription (active)
    const { data: subData, error: subErr } = await supabase
      .from("subscriptions")
      .insert({
        user_id,
        plan,
        amount,
        currency,
        tx_hash: txHash,
        provider: "helio",
        status: "active",
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
      })
      .select("id, expires_at")
      .single();

    if (subErr) {
      console.error("[insert subscription] error:", subErr);
      return json(500, { ok:false, error:"insert subscription failed" });
    }

    return json(200, { ok:true, saved:true, user_id, subscription_id: subData.id, expires_at: subData.expires_at });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
}
