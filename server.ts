import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import { createFamoConfig, loadDotEnv, type EnvSource } from './src/config.ts';
import { renderAdminLoginPage } from './src/renderAdminLoginPage.ts';
import { renderLoginPage } from './src/renderLoginPage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractOrigin(rawUrl: string): string {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
}

function buildAdminCsp(env: EnvSource): string {
  const config = createFamoConfig(env);
  const assetOrigin = extractOrigin(config.assetBase());
  const apiOrigin = extractOrigin(config.apiUrl());

  const assetSrc = assetOrigin ? `'self' ${assetOrigin}` : "'self'";
  const connectSrc = apiOrigin ? `'self' ${apiOrigin}` : "'self'";

  return [
    "default-src 'self'",
    `script-src ${assetSrc}`,
    `style-src ${assetSrc}`,
    `img-src ${assetSrc} data:`,
    `font-src ${assetSrc}`,
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

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

  const handleAdminLoginPage = (forcePreview: boolean) => (req: Request, res: Response) => {
    const returnUrl = typeof req.query.return_url === 'string' ? req.query.return_url : '';
    const dir = req.query.dir === 'ltr' ? 'ltr' : 'rtl';
    const preview = forcePreview || req.query.preview === '1';

    const html = renderAdminLoginPage({ returnUrl, dir, preview, env });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', buildAdminCsp(env));
    res.status(200).send(html);
  };

  app.get('/', handleLoginPage);
  app.get('/index.php', handleLoginPage);
  app.get('/login', handleLoginPage);
  app.get('/admin/login', handleAdminLoginPage(false));
  app.get('/admin/login/preview', handleAdminLoginPage(true));

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
