import { createDecipheriv, createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

function cleanValue(value) {
  if (!value) return "";
  return String(value).trim().replace(/^["']|["']$/g, "").trim();
}

function deriveKey(secret) {
  return createHash("sha256").update(String(secret)).digest();
}

export function decryptSession(encryptedString, secret) {
  try {
    if (!encryptedString || !secret) return null;
    const parts = String(encryptedString).split(".");
    if (parts.length !== 3) return null;
    const [ivB64, authTagB64, ciphertextB64] = parts;
    const key = deriveKey(secret);
    const iv = Buffer.from(ivB64, "base64url");
    const authTag = Buffer.from(authTagB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertextB64, "base64url", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

function getOAuthStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    try {
      return getStore({ name: "mercado-livre-oauth", siteID, token, consistency: "strong" });
    } catch {
      return getStore({ name: "mercado-livre-oauth", siteID, token });
    }
  }

  try {
    return getStore({ name: "mercado-livre-oauth", consistency: "strong" });
  } catch {
    return getStore("mercado-livre-oauth");
  }
}

function jsonResponse(status, data, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  for (const [key, val] of Object.entries(extraHeaders)) {
    headers.set(key, val);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return "";
}

export default async function mlStatus(request) {
  if (request.method === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Método não permitido." });
  }

  const configuredClientId = cleanValue(process.env.ML_CLIENT_ID);
  const clientSecret = cleanValue(process.env.ML_CLIENT_SECRET);

  let activeConn = null;

  // 1. TENTA RECUPERAR A CONEXÃO VIA COOKIE CIFRADO AES-256-GCM (Mais resiliente e seguro)
  const authSessionCookie = getCookie(request, "ml_auth_session");
  if (authSessionCookie && clientSecret) {
    const decrypted = decryptSession(authSessionCookie, clientSecret);
    if (decrypted && decrypted.user_id) {
      activeConn = {
        connected: true,
        user_id: decrypted.user_id,
        app_id: decrypted.app_id || configuredClientId,
        connected_at: decrypted.connected_at,
        expires_at: decrypted.expires_at,
        scope: decrypted.scope,
      };
    }
  }

  // 2. SE NÃO ENCONTROU OU SE O COOKIE NÃO ESTAVA PRESENTE, CONSULTA O NETLIFY BLOBS
  if (!activeConn) {
    try {
      const store = getOAuthStore();
      const sessionUserId = getCookie(request, "ml_session_user");

      if (sessionUserId) {
        const accountRaw = await store.get(`account-${sessionUserId}`);
        if (accountRaw) {
          try {
            const parsed = JSON.parse(accountRaw);
            activeConn = {
              connected: true,
              user_id: parsed.user_id,
              app_id: parsed.app_id || configuredClientId,
              connected_at: parsed.saved_at,
              expires_at: parsed.expires_at,
              scope: parsed.scope,
            };
          } catch {}
        }
      }

      if (!activeConn) {
        const activeRaw = await store.get("active-connection");
        if (activeRaw) {
          try {
            const parsed = JSON.parse(activeRaw);
            if (parsed && parsed.connected && parsed.user_id) {
              activeConn = parsed;
            }
          } catch {}
        }
      }
    } catch (storeError) {
      // Netlify Blobs não configurado ou indisponível
      console.warn("[ml-status] Netlify Blobs não acessível neste ambiente:", storeError?.message || storeError);
    }
  }

  // 3. SE IDENTIFICOU UMA CONEXÃO VÁLIDA
  if (activeConn && activeConn.connected && activeConn.user_id) {
    const isExpired = activeConn.expires_at
      ? new Date(activeConn.expires_at).getTime() < Date.now()
      : false;

    return jsonResponse(200, {
      configured: Boolean(configuredClientId || activeConn.app_id),
      connected: true,
      app_id: activeConn.app_id || configuredClientId,
      user_id: activeConn.user_id,
      connected_at: activeConn.connected_at,
      expires_at: activeConn.expires_at,
      is_expired: isExpired,
      status: isExpired ? "expired" : "active",
    });
  }

  // 4. DESCONECTADO (Não há autorização válida registrada)
  return jsonResponse(200, {
    configured: Boolean(configuredClientId),
    connected: false,
    app_id: configuredClientId || "",
    user_id: "",
    status: "disconnected",
  });
}
