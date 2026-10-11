import test from 'node:test';
import assert from 'node:assert/strict';
import mlAuthStart from '../netlify/functions/ml-auth-start.js';
import mlCallback from '../netlify/functions/ml-callback.js';
import mlStatus from '../netlify/functions/ml-status.js';
import mlDisconnect from '../netlify/functions/ml-disconnect.js';

test('1. mlAuthStart: valida configuração e gera fluxo PKCE correto', async () => {
  process.env.ML_CLIENT_ID = '8472918471928374';
  process.env.ML_REDIRECT_URI = 'https://meu-app.netlify.app/.netlify/functions/ml-callback';

  const req = new Request('https://meu-app.netlify.app/.netlify/functions/ml-auth-start', {
    method: 'GET',
  });

  const res = await mlAuthStart(req);
  assert.equal(res.status, 302, 'Deveria retornar 302 Redirect');

  const location = res.headers.get('Location');
  assert.ok(location, 'Deveria conter cabeçalho Location');

  const authUrl = new URL(location);
  assert.equal(authUrl.hostname, 'auth.mercadolivre.com.br');
  assert.equal(authUrl.searchParams.get('client_id'), '8472918471928374');
  assert.equal(authUrl.searchParams.get('response_type'), 'code');
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authUrl.searchParams.get('code_challenge'), 'Deveria conter code_challenge');
  assert.ok(authUrl.searchParams.get('state'), 'Deveria conter state');

  const setCookie = res.headers.get('Set-Cookie') || '';
  assert.ok(setCookie.includes('ml_oauth_state='), 'Deveria definir cookie ml_oauth_state');
  assert.ok(setCookie.includes('Path=/'), 'Deveria usar Path=/');
  assert.ok(setCookie.includes('HttpOnly'), 'Deveria ser HttpOnly');
});

test('2. mlAuthStart: rejeita método diferente de GET', async () => {
  const req = new Request('https://meu-app.netlify.app/.netlify/functions/ml-auth-start', {
    method: 'POST',
  });
  const res = await mlAuthStart(req);
  assert.equal(res.status, 405);
});

test('3. mlCallback: rejeita retorno sem state válido ou cookie correspondente', async () => {
  process.env.ML_CLIENT_ID = '8472918471928374';
  process.env.ML_CLIENT_SECRET = 'segredo_teste_123';
  process.env.ML_REDIRECT_URI = 'https://meu-app.netlify.app/.netlify/functions/ml-callback';

  const req = new Request('https://meu-app.netlify.app/.netlify/functions/ml-callback?code=TG-123&state=state_invalido', {
    method: 'GET',
  });

  const res = await mlCallback(req);
  assert.equal(res.status, 400, 'Deveria retornar 400 por falha no state/cookie');
  const body = await res.text();
  assert.ok(body.includes('Retorno OAuth inválido'), 'Deveria alertar sobre validação de segurança');
  assert.ok(res.headers.get('Set-Cookie')?.includes('ml_oauth_state=;'), 'Deveria limpar cookie temporário');
});

test('4. mlCallback: rejeita quando Mercado Livre devolve erro na URL', async () => {
  const req = new Request('https://meu-app.netlify.app/.netlify/functions/ml-callback?error=access_denied', {
    method: 'GET',
  });

  const res = await mlCallback(req);
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.ok(body.includes('Autorização não concluída'));
});

test('5. mlStatus: retorna status desconectado quando não há cookie de sessão nem registros', async () => {
  process.env.ML_CLIENT_ID = '8472918471928374';
  process.env.ML_CLIENT_SECRET = 'segredo_teste_123';
  const req = new Request('https://meu-app.netlify.app/.netlify/functions/ml-status', {
    method: 'GET',
  });

  const res = await mlStatus(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.configured, true);
  assert.equal(data.app_id, '8472918471928374');
  assert.equal(data.connected, false);
  assert.equal(data.user_id, '');
  assert.equal(data.status, 'disconnected');
});

test('6. mlDisconnect: limpa a conexão e devolve cabeçalho de expiração de todos os cookies', async () => {
  const req = new Request('https://meu-app.netlify.app/.netlify/functions/ml-disconnect', {
    method: 'POST',
    headers: {
      'Cookie': 'ml_session_user=987654321; ml_auth_session=fake_token',
    },
  });

  const res = await mlDisconnect(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.connected, false);
  const setCookie = res.headers.get('Set-Cookie') || '';
  assert.ok(setCookie.includes('ml_auth_session=;'), 'Deveria zerar o cookie ml_auth_session');
  assert.ok(setCookie.includes('ml_session_user=;'), 'Deveria zerar o cookie ml_session_user');
  assert.ok(setCookie.includes('Max-Age=0'), 'Deveria definir Max-Age=0');
});

test('7. mlCallback + mlStatus: fluxo real completo com troca de token e recuperação do ID do vendedor', async () => {
  process.env.ML_CLIENT_ID = '8472918471928374';
  process.env.ML_CLIENT_SECRET = 'segredo_super_seguro_teste_2026';
  process.env.ML_REDIRECT_URI = 'https://meu-app.netlify.app/.netlify/functions/ml-callback';

  const testState = 'teste_state_1234567890';
  const testVerifier = 'teste_code_verifier_longo_com_mais_de_43_caracteres_rfc7636';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('api.mercadolibre.com/oauth/token')) {
      const bodyParams = new URLSearchParams(options.body);
      assert.equal(bodyParams.get('grant_type'), 'authorization_code');
      assert.equal(bodyParams.get('client_id'), '8472918471928374');
      assert.equal(bodyParams.get('client_secret'), 'segredo_super_seguro_teste_2026');
      assert.equal(bodyParams.get('code'), 'TG-CODIGO-TESTE');
      assert.equal(bodyParams.get('code_verifier'), testVerifier);

      return new Response(JSON.stringify({
        access_token: 'APP_USR-test-token-123456',
        refresh_token: 'TG-refresh-token-123456',
        token_type: 'Bearer',
        expires_in: 21600,
        scope: 'read write',
        user_id: 123456789,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, options);
  };

  try {
    // 1. Simula retorno da autorização do Mercado Livre com o cookie PKCE state
    const cookieHeader = `ml_oauth_state=${testState}.${testVerifier}`;
    const callbackReq = new Request(`https://meu-app.netlify.app/.netlify/functions/ml-callback?code=TG-CODIGO-TESTE&state=${testState}`, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
      },
    });

    const callbackRes = await mlCallback(callbackReq);
    assert.equal(callbackRes.status, 200, 'Callback deve responder com sucesso HTTP 200');

    const htmlBody = await callbackRes.text();
    assert.ok(htmlBody.includes('Mercado Livre conectado'));

    // Recupera os cookies gerados no callback
    let cookiesSent = [];
    if (typeof callbackRes.headers.getSetCookie === 'function') {
      cookiesSent = callbackRes.headers.getSetCookie();
    } else {
      cookiesSent = [callbackRes.headers.get('set-cookie') || ''];
    }

    const authSessionCookie = cookiesSent.find(c => c.includes('ml_auth_session=')) || '';
    assert.ok(authSessionCookie.includes('ml_auth_session='), 'Deveria conter cookie ml_auth_session cifrado');

    // Extrai o valor do cookie para enviar na chamada de status
    const match = authSessionCookie.match(/ml_auth_session=([^;]+)/);
    assert.ok(match && match[1], 'Deveria extrair o token do cookie');
    const cookieValue = match[1];

    // 2. Agora chama ml-status passando o cookie de sessão autenticada
    const statusReq = new Request('https://meu-app.netlify.app/.netlify/functions/ml-status', {
      method: 'GET',
      headers: {
        Cookie: `ml_auth_session=${cookieValue}`,
      },
    });

    const statusRes = await mlStatus(statusReq);
    assert.equal(statusRes.status, 200);

    const statusData = await statusRes.json();
    assert.equal(statusData.connected, true, 'Status DEVE ser conectado!');
    assert.equal(statusData.user_id, '123456789', 'Deve recuperar o ID real do vendedor do Mercado Livre!');
    assert.equal(statusData.app_id, '8472918471928374', 'Deve retornar o App ID configurado!');
    assert.equal(statusData.status, 'active', 'Status deve ser active!');
    assert.equal(statusData.is_expired, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
