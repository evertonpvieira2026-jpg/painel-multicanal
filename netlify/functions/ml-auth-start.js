import { createHash, randomBytes } from "node:crypto";

const OAUTH_STATE_COOKIE = "ml_oauth_state";
const COOKIE_PATH = "/";

function cleanValue(value) {
  if (!value) return "";
  return String(value).trim().replace(/^["']|["']$/g, "").trim();
}

function response(status, message) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default async function mlAuthStart(request) {
  if (request.method !== "GET") {
    return response(405, "Método não permitido.");
  }

  const requestUrl = new URL(request.url);
  const rawClientId = requestUrl.searchParams.get("client_id");
  const providedClientId = rawClientId ? cleanValue(rawClientId) : "";
  const configuredClientId = cleanValue(process.env.ML_CLIENT_ID);
  const redirectUri = cleanValue(process.env.ML_REDIRECT_URI);

  if (!configuredClientId || !redirectUri) {
    return response(500, "A configuração OAuth do Mercado Livre está incompleta no Netlify.");
  }

  // Se o frontend passou o client_id, valida se confere; se não passou, usa diretamente o configuredClientId
  if (providedClientId && providedClientId !== configuredClientId) {
    return response(400, "O App ID informado não corresponde ao App ID configurado no servidor.");
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(redirectUri);
  } catch {
    return response(500, "A URL de retorno do Mercado Livre não é válida.");
  }

  if (
    callbackUrl.protocol !== "https:" ||
    callbackUrl.pathname !== "/.netlify/functions/ml-callback" ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    return response(500, "Configure a URL de retorno HTTPS exata deste site no Netlify.");
  }

  // 1. Gera o state contra CSRF
  const state = randomBytes(32).toString("base64url");

  // 2. PKCE obrigatório: Gera code_verifier criptográfico seguro (64 caracteres base64url, RFC 7636)
  const codeVerifier = randomBytes(48).toString("base64url");

  // 3. Calcula o code_challenge usando SHA-256 (RFC 7636)
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  // 4. Armazena state e code_verifier juntos no cookie seguro
  const stateCookie = `${state}.${codeVerifier}`;

  const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", configuredClientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Location": authorizationUrl.toString(),
    "Referrer-Policy": "no-referrer",
  });
  headers.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=${stateCookie}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  return new Response(null, {
    status: 302,
    headers,
  });
}
