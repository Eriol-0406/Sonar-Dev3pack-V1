// Local dev server replacement for `vercel dev` (which requires Vercel
// auth). Mirrors the rewrites in vercel.json and dispatches into the same
// /api/*.ts handlers, so `req.method`, `req.body`, `req.query` behave
// the same as on Vercel for our handler signatures.
import express from 'express';
import { createServer } from 'node:http';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: '*/*', limit: '1mb' }));

type Handler = (req: express.Request, res: express.Response) => void | Promise<void>;

const handlerCache = new Map<string, Handler>();
async function load(name: string): Promise<Handler> {
  const cached = handlerCache.get(name);
  if (cached) return cached;
  const url = pathToFileURL(resolve(__dirname, `api/${name}.ts`)).href;
  const mod = await import(url);
  const handler = mod.default as Handler;
  handlerCache.set(name, handler);
  return handler;
}

function mount(method: 'get' | 'post' | 'all', route: string, handlerName: string, queryDefaults: Record<string, string> = {}) {
  app[method](route, async (req, res) => {
    try {
      const handler = await load(handlerName);
      // Express 5's req.query is a getter-backed object that doesn't accept
      // direct property assignment. Replace it with a merged plain object so
      // route params + rewrite defaults flow through to the Vercel handlers.
      const merged: Record<string, unknown> = {
        ...(req.query as Record<string, unknown>),
        ...queryDefaults,
        ...req.params,
      };
      Object.defineProperty(req, 'query', { value: merged, configurable: true });
      await handler(req, res);
    } catch (err) {
      console.error(`[bridge] ${handlerName} threw:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'bridge_error', message: String(err) });
      }
    }
  });
}

// Mirror vercel.json rewrites
mount('post', '/risk', 'analyze');
mount('post', '/analyze', 'analyze');
mount('post', '/api/analyze', 'analyze');

mount('post', '/confirm', 'confirm');
mount('post', '/api/confirm', 'confirm');

mount('post', '/voice/generate', 'voice');
mount('all', '/voice/:sessionId', 'voice');
mount('all', '/api/voice', 'voice');

mount('post', '/cooldown/start', 'cooldown', { action: 'start' });
mount('get', '/cooldown/:sessionId', 'cooldown', { action: 'status' });
mount('post', '/cooldown/:sessionId/acknowledge', 'cooldown', { action: 'acknowledge' });
mount('all', '/api/cooldown', 'cooldown');

mount('get', '/users/:wallet', 'users', { action: 'profile' });
mount('all', '/users/:wallet/preferences', 'users', { action: 'preferences' });
mount('get', '/users/:wallet/risk-logs', 'users', { action: 'risk-logs' });
mount('get', '/users/:wallet/baseline', 'users', { action: 'baseline' });
mount('all', '/api/users', 'users');

mount('get', '/health', 'health');
mount('get', '/api/health', 'health');

// Static assets — mirrors Vercel's default behavior of serving public/.
app.use(express.static(resolve(__dirname, 'public')));

const port = Number(process.env.PORT ?? 3000);
const server = createServer(app);
server.listen(port, () => {
  console.log(`[bridge] sonar local dev → http://localhost:${port}`);
  console.log(`[bridge] health           → http://localhost:${port}/health`);
});
