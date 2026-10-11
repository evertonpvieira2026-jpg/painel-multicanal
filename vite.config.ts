import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import mlAuthStart from './netlify/functions/ml-auth-start.js';
import mlCallback from './netlify/functions/ml-callback.js';
import mlStatus from './netlify/functions/ml-status.js';
import mlDisconnect from './netlify/functions/ml-disconnect.js';

function netlifyFunctionsDevPlugin(): Plugin {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/.netlify/functions/')) {
          return next();
        }

        try {
          const isEncrypted = Boolean((req.socket as any)?.encrypted);
          const protocol = req.headers['x-forwarded-proto'] || (isEncrypted ? 'https' : 'http');
          const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
          const url = new URL(req.url, `${protocol}://${host}`);
          const pathname = url.pathname;

          const headers = new Headers();
          for (const [key, val] of Object.entries(req.headers)) {
            if (val) {
              if (Array.isArray(val)) {
                for (const item of val) headers.append(key, item);
              } else {
                headers.set(key, val);
              }
            }
          }

          const webReq = new Request(url, {
            method: req.method,
            headers,
          });

          let webRes: Response | null = null;

          if (pathname === '/.netlify/functions/ml-status') {
            webRes = await mlStatus(webReq);
          } else if (pathname === '/.netlify/functions/ml-callback') {
            webRes = await mlCallback(webReq);
          } else if (pathname === '/.netlify/functions/ml-auth-start') {
            webRes = await mlAuthStart(webReq);
          } else if (pathname === '/.netlify/functions/ml-disconnect') {
            webRes = await mlDisconnect(webReq);
          }

          if (webRes) {
            res.statusCode = webRes.status;
            for (const [key, val] of webRes.headers.entries()) {
              if (key.toLowerCase() !== 'set-cookie') {
                res.setHeader(key, val);
              }
            }

            // Garante múltiplos cookies separados corretamente
            if (typeof webRes.headers.getSetCookie === 'function') {
              const cookies = webRes.headers.getSetCookie();
              if (cookies.length > 0) {
                res.setHeader('Set-Cookie', cookies);
              }
            } else {
              const singleCookie = webRes.headers.get('set-cookie');
              if (singleCookie) {
                res.setHeader('Set-Cookie', singleCookie);
              }
            }

            const buffer = await webRes.arrayBuffer();
            res.end(Buffer.from(buffer));
            return;
          }
        } catch (err) {
          console.error('[vite-functions-bridge] Erro ao executar função:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Erro interno na função de desenvolvimento.' }));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), netlifyFunctionsDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

