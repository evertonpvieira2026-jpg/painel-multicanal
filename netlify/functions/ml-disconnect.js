import { getStore } from "@netlify/blobs";

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

function jsonResponse(status, data, extraHeaders = []) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  for (const cookie of extraHeaders) {
    headers.append("Set-Cookie", cookie);
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

export default async function mlDisconnect(request) {
  if (request.method === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Método não permitido." });
  }

  const sessionUserId = getCookie(request, "ml_session_user");

  try {
    const store = getOAuthStore();
    await store.delete("active-connection");
    if (sessionUserId) {
      await store.delete(`account-${sessionUserId}`);
    }
  } catch (error) {
    console.warn("[ml-disconnect] Aviso ao limpar Netlify Blobs:", error?.message || error);
  }

  const clearAuthSession = "ml_auth_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  const clearSessionUser = "ml_session_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

  return jsonResponse(
    200,
    {
      success: true,
      connected: false,
      message: "Conexão com o Mercado Livre encerrada com sucesso.",
    },
    [clearAuthSession, clearSessionUser]
  );
}
