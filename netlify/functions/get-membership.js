// netlify/functions/get-membership.js
/**
 * OrbitalScan — Get Membership (read-only)
 *
 * Usage (GET):
 *   /.netlify/functions/get-membership?email=user@mail.com
 *   /.netlify/functions/get-membership?wallet=0xABC...
 *
 * Response:
 *   { ok: true, active: boolean, record?: {...}, reason?: "expired|not_found|missing_param" }
 */

import { getStore } from "@netlify/blobs";

export async function handler(event) {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const params = new URLSearchParams(event.rawQuery || event.queryStringParameters && new URLSearchParams(event.queryStringParameters).toString() || "");
    const email = (params.get("email") || "").trim().toLowerCase();
    const wallet = (params.get("wallet") || "").trim();

    if (!email && !wallet) {
      return json(400, { ok:false, active:false, reason:"missing_param" });
    }

    const store = getStore({ name: "members", consistency: "strong" });
    const key = email ? `email:${email}` : `wallet:${wallet.toLowerCase()}`;
    const record = await store.getJSON(key);

    if (!record) {
      return json(200, { ok:true, active:false, reason:"not_found" });
    }

    const now = Date.now();
    const expiry = Date.parse(record.expires_at);
    const active = Number.isFinite(expiry) ? expiry > now : false;

    return json(200, {
      ok: true,
      active,
      record: active ? record : undefined,
      reason: active ? undefined : "expired"
    });
  } catch (err) {
    console.error("[GetMembership] Error:", err);
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
