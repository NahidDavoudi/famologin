import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import { loadDotEnv, type EnvSource } from './src/config.ts';
import { renderLoginPage } from './src/renderLoginPage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(env: EnvSource = process.env): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use('/assets', express.static(path.join(__dirname, 'assets')));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const handleLoginPage = (req: Request, res: Response) => {
    const source = typeof req.query.source === 'string' ? req.query.source : '';
    const returnUrl = typeof req.query.return_url === 'string' ? req.query.return_url : '';

    const html = renderLoginPage({ source, returnUrl, env });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  };

  app.get('/', handleLoginPage);
  app.get('/index.php', handleLoginPage);
  app.get('/login', handleLoginPage);

  return app;
}

const isMainModule =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  loadDotEnv(path.join(__dirname, '.env'));

  const PORT = Number(process.env.PORT) || 3000;
  const HOST = '0.0.0.0';
  const app = createApp(process.env);

  app.listen(PORT, HOST, () => {
    console.log(`Famo Login server running at http://${HOST}:${PORT}`);
  });
}
