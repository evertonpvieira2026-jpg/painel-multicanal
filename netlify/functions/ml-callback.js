import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const OAUTH_STATE_COOKIE = "ml_oauth_state";
const COOKIE_PATH = "/";
const CLEAR_STATE_COOKIE =
  `${OAUTH_STATE_COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function cleanValue(value) {
  if (!value) return "";
  return String(value).trim().replace(/^["']|["']$/g, "").trim();
}

function deriveKey(secret) {
  return createHash("sha256").update(String(secret)).digest();
}

export function encryptSession(data, secret) {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64url");
  encrypted += cipher.final("base64url");
  const authTag = cipher.getAuthTag().toString("base64url");
  return `${iv.toString("base64url")}.${authTag}.${encrypted}`;
}

export function decryptSession(encryptedString, secret) {
  try {
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function page(status, title, message, isSuccess = false, cookiesToSet = []) {
  const refreshMeta = isSuccess ? '<meta http-equiv="refresh" content="2;url=/?connected=1">' : "";
  const badgeColor = isSuccess ? "background:#dcfce7;color:#15803d" : "background:#fee2e2;color:#b91c1c";
  const badgeText = isSuccess ? "✓ CONEXÃO CONFIRMADA" : "✕ FALHA NA AUTORIZAÇÃO";
  const buttonText = isSuccess ? "Voltar ao Painel Robô CEO" : "Tentar Novamente no Painel";
  const borderColor = isSuccess ? "#86efac" : "#cbd5e1";

  const html = [
    "<!doctype html>",
    '<html lang="pt-BR">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="referrer" content="no-referrer">',
    "  " + refreshMeta,
    "  <title>" + escapeHtml(title) + " — Robô CEO</title>",
    "</head>",
    '<body style="font:16px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:580px;margin:50px auto;padding:0 24px;color:#1e293b;background:#f8fafc;line-height:1.6">',
    '  <div style="background:#ffffff;border:1px solid ' + borderColor + ';border-radius:12px;padding:32px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)">',
    '    <div style="display:inline-block;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700;margin-bottom:16px;' + badgeColor + '">',
    "      " + badgeText,
    "    </div>",
    '    <h1 style="font-size:22px;margin:0 0 12px;color:#0f172a">' + escapeHtml(title) + "</h1>",
    '    <p style="margin:0 0 24px;color:#475569">' + escapeHtml(message) + "</p>",
    "    <div>",
    '      <a href="/?connected=1" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 22px;border-radius:8px">' + buttonText + "</a>",
    "    </div>",
    "  </div>",
    "</body>",
    "</html>",
  ].join("\n");

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

  headers.append("Set-Cookie", CLEAR_STATE_COOKIE);

  for (const cookie of cookiesToSet) {
    if (cookie) {
      headers.append("Set-Cookie", cookie);
    }
  }

  return new Response(html, {
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

function redactSensitiveValues(message, values) {
  let safeMessage = String(message ?? "");
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      safeMessage = safeMessage.split(value).join("[redigido]");
    }
  }

  return safeMessage
    .replace(/\b(?:access_token|refresh_token|client_secret|code_verifier)\b\s*[:=]\s*["']?[^,\s"'&}]+/gi, "[credencial redigida]")
    .replace(/\b(?:APP_USR|TG)-[A-Za-z0-9._~-]{8,}\b/g, "[token redigido]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redigido]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 300);
}

function safeErrorCode(value) {
  if (typeof value !== "string") return "desconhecido";
  const code = value.trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : "desconhecido";
}

async function readOAuthError(response, sensitiveValues) {
  let payload = {};
  try {
    const body = await response.text();
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed;
    }
  } catch {
    // Ignora corpo ilegível
  }

  return {
    code: safeErrorCode(payload.error),
    description: redactSensitiveValues(
      payload.error_description ?? payload.message ?? "",
      sensitiveValues,
    ),
  };
}

function hintForOAuthError(code) {
  switch (code) {
    case "invalid_client":
      return "Confirme no Netlify se ML_CLIENT_ID e ML_CLIENT_SECRET pertencem ao mesmo aplicativo e se o segredo atual está configurado.";
    case "invalid_grant":
      return "O código de autorização pode ter expirado ou sido reutilizado. Inicie uma nova autorização pelo painel.";
    case "invalid_request":
      return "Confira se o redirect_uri e o code_verifier correspondem aos enviados na autorização inicial.";
    case "unauthorized_client":
    case "unauthorized_application":
      return "Confira o status da sua aplicação no painel de desenvolvedores do Mercado Livre.";
    default:
      return "Consulte os logs da função no Netlify para detalhes técnicos.";
  }
}

function statesMatch(expected, received) {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    expectedBytes.length > 0 &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export function matchesExpectedRedirect(redirectUri, requestUrl, request) {
  try {
    const configured = new URL(redirectUri);
    const incoming = new URL(requestUrl);

    // 1. Em produção, ML_REDIRECT_URI deve usar protocolo HTTPS
    const isLocalhost = incoming.hostname === "localhost" || incoming.hostname === "127.0.0.1";
    if (!isLocalhost && configured.protocol !== "https:") {
      console.error("[ml-callback] ML_REDIRECT_URI deve usar HTTPS em produção.");
      return false;
    }

    // 2. Normaliza os pathnames sem barra no final e valida caminho exato
    const configuredPath = configured.pathname.replace(/\/+$/, "");
    const incomingPath = incoming.pathname.replace(/\/+$/, "");
    if (configuredPath !== "/.netlify/functions/ml-callback" || incomingPath !== "/.netlify/functions/ml-callback") {
      console.error(`[ml-callback] Pathname incorreto. Configurado: ${configuredPath}, Recebido: ${incomingPath}`);
      return false;
    }

    // 3. Em produção, compara o host do callback com o host configurado
    if (!isLocalhost) {
      const forwardedHost = request?.headers?.get?.("x-forwarded-host");
      const incomingHost = (forwardedHost || incoming.host || "").toLowerCase();
      const configuredHost = configured.host.toLowerCase();

      if (incomingHost && configuredHost && incomingHost !== configuredHost) {
        if (!incomingHost.endsWith(configuredHost) && !configuredHost.endsWith(incomingHost)) {
          console.warn(`[ml-callback] Host divergente: recebido '${incomingHost}', configurado '${configuredHost}'`);
          return false;
        }
      }
    }

    return true;
  } catch (err) {
    console.error("[ml-callback] Erro ao comparar URLs de redirecionamento:", err?.message || err);
    return false;
  }
}

export default async function mlCallback(request) {
  if (request.method !== "GET") {
    return page(405, "Método não permitido", "Use o fluxo oficial de autorização do Mercado Livre.", false);
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const receivedState = requestUrl.searchParams.get("state") ?? "";
  const storedState = getCookie(request, OAUTH_STATE_COOKIE);
  const verifierSeparator = storedState.indexOf(".");
  const expectedState = verifierSeparator >= 0
    ? storedState.slice(0, verifierSeparator)
    : storedState;
  const codeVerifier = verifierSeparator >= 0
    ? storedState.slice(verifierSeparator + 1)
    : "";

  if (requestUrl.searchParams.has("error")) {
    return page(400, "Autorização não concluída", "O Mercado Livre não autorizou esta conexão. Nenhum anúncio foi publicado.", false);
  }

  if (!expectedState || !statesMatch(expectedState, receivedState)) {
    return page(400, "Retorno OAuth inválido", "A validação de segurança falhou (CSRF state mismatch). Inicie a conexão novamente pelo painel.", false);
  }

  if (!code) {
    return page(400, "Código OAuth ausente", "O Mercado Livre não retornou um código de autorização. Nenhuma conexão foi confirmada.", false);
  }

  if (!codeVerifier) {
    return page(400, "Verificação PKCE ausente", "Inicie a autorização novamente pelo painel para gerar o verificador PKCE.", false);
  }

  const clientId = cleanValue(process.env.ML_CLIENT_ID);
  const clientSecret = cleanValue(process.env.ML_CLIENT_SECRET);
  const redirectUri = cleanValue(process.env.ML_REDIRECT_URI);

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !matchesExpectedRedirect(redirectUri, requestUrl, request)
  ) {
    return page(500, "Configuração incompleta", "Revise as variáveis OAuth no Netlify. Nenhuma conexão foi confirmada.", false);
  }

  const tokenRequest = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  let tokenResponse;
  try {
    tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenRequest,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    console.error("[ml-callback] falha de rede/timeout ao chamar https://api.mercadolibre.com/oauth/token");
    return page(502, "Falha na comunicação", "Não foi possível contatar o endpoint OAuth do Mercado Livre. Tente novamente em instantes.", false);
  }

  if (!tokenResponse.ok) {
    const oauthError = await readOAuthError(tokenResponse, [clientId, clientSecret, code, codeVerifier]);
    console.error("[ml-callback] troca OAuth recusada pelo Mercado Livre", JSON.stringify({
      status: tokenResponse.status,
      error: oauthError.code,
      description: oauthError.description,
    }));
    const detail = oauthError.description ? " Resposta: " + oauthError.description : "";
    return page(
      502,
      "Autorização não confirmada",
      "HTTP " + tokenResponse.status + "; erro " + oauthError.code + "." + detail + " " + hintForOAuthError(oauthError.code) + " Nenhuma conexão foi confirmada.",
      false
    );
  }

  let token;
  try {
    token = await tokenResponse.json();
  } catch {
    return page(502, "Resposta inválida", "O Mercado Livre não retornou JSON válido. Nenhuma conexão foi confirmada.", false);
  }

  if (
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    (typeof token.user_id !== "string" && typeof token.user_id !== "number")
  ) {
    return page(502, "Resposta inválida", "O Mercado Livre não retornou os dados de credencial necessários. Nenhuma conexão foi confirmada.", false);
  }

  const userId = String(token.user_id);
  const expiresInSeconds = Number(token.expires_in) || 21600;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const savedAt = new Date().toISOString();

  // 1. TENTA GRAVAR NO NETLIFY BLOBS (Storage Primário)
  try {
    const store = getOAuthStore();
    const tokenRecord = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type || "Bearer",
      expires_in: expiresInSeconds,
      expires_at: expiresAt,
      scope: token.scope || "",
      user_id: userId,
      app_id: clientId,
      saved_at: savedAt,
    };
    await store.set(`account-${userId}`, JSON.stringify(tokenRecord));

    const activeRecord = {
      connected: true,
      user_id: userId,
      app_id: clientId,
      connected_at: savedAt,
      expires_at: expiresAt,
      scope: token.scope || "",
    };
    await store.set("active-connection", JSON.stringify(activeRecord));
  } catch (storeError) {
    // Log detalhado sem expor segredos. Não interrompe o fluxo de conexão porque a Camada Criptográfica protege a sessão.
    console.warn("[ml-callback] Aviso: Netlify Blobs indisponível ou não vinculado neste ambiente. Utilizando persistência de sessão autenticada.", storeError?.message || storeError);
  }

  // 2. SESSÃO CRIPTOGRAFADA NO SERVIDOR (AES-256-GCM) — Camada Durável Segura
  const sessionPayload = {
    user_id: userId,
    app_id: clientId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    connected_at: savedAt,
    expires_at: expiresAt,
    scope: token.scope || "",
  };

  const encryptedSession = encryptSession(sessionPayload, clientSecret);
  const authSessionCookie = `ml_auth_session=${encryptedSession}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
  const userSessionCookie = `ml_session_user=${userId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;

  return page(
    200,
    "Mercado Livre conectado",
    "A autorização foi confirmada pelo Mercado Livre e a sessão autenticada foi persistida com segurança no servidor. Redirecionando para o painel Robô CEO...",
    true,
    [authSessionCookie, userSessionCookie]
  );
}
