import fs from 'node:fs';

export type EnvSource = Record<string, string | undefined>;

export interface FamoClientConfig {
  assetUrl: string;
  apiUrl: string;
  telegramBotUsername: string;
  publicUrl?: string;
  adminUrl?: string;
  dashboardUrl?: string;
  loginUrl?: string;
  planUrl?: string;
}

export interface FamoConfig {
  env: (key: string, defaultValue?: string) => string;
  appMode: () => string;
  isDev: () => boolean;
  asset: (assetPath: string, fallback: string) => string;
  assetBase: () => string;
  apiUrl: () => string;
  publicUrl: () => string;
  adminUrl: () => string;
  dashboardUrl: () => string;
  loginUrl: () => string;
  planUrl: () => string;
  telegramBotUsername: () => string;
  clientConfig: () => FamoClientConfig;
  configScript: () => string;
}

export function parseEnvContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || !line.includes('=')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (key === '') {
      continue;
    }
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

/**
 * Loads a colocated .env file without overriding existing process environment variables.
 */
export function loadDotEnv(filePath: string, targetEnv: EnvSource = process.env): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const entries = parseEnvContent(content);
    for (const [key, value] of Object.entries(entries)) {
      if (targetEnv[key] !== undefined) {
        continue;
      }
      targetEnv[key] = value;
    }
  } catch {
    // Ignore unreadable .env file, matching original config.php behavior.
  }
}

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027');
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function createFamoConfig(envSource: EnvSource = process.env): FamoConfig {
  const env = (key: string, defaultValue = ''): string => {
    const value = envSource[key];
    return value === undefined || value === '' ? defaultValue : String(value);
  };

  const appMode = (): string => {
    return env('APP_MODE', env('APP_ENV', 'production')).trim().toLowerCase();
  };

  const isDev = (): boolean => appMode() === 'development';

  const asset = (assetPath: string, fallback: string): string => {
    const defaultBase = isDev() ? '' : 'https://assets.famoacademy.ir';
    const base = stripTrailingSlashes(env('ASSET_URL', defaultBase));
    return base === '' ? fallback : `${base}/${assetPath.replace(/^\/+/, '')}`;
  };

  const assetBase = (): string => {
    return stripTrailingSlashes(env('ASSET_URL', 'https://assets.famoacademy.ir'));
  };

  const apiUrl = (): string => {
    const base = stripTrailingSlashes(env('API_URL', 'https://api.famoacademy.ir'));
    return /\/api\/v1$/.test(base) ? base : `${base}/api/v1`;
  };

  const publicUrl = (): string => stripTrailingSlashes(env('PUBLIC_URL', ''));
  const adminUrl = (): string => stripTrailingSlashes(env('ADMIN_URL', ''));
  const dashboardUrl = (): string => stripTrailingSlashes(env('DASHBOARD_URL', ''));
  const loginUrl = (): string => stripTrailingSlashes(env('LOGIN_URL', ''));
  const planUrl = (): string => stripTrailingSlashes(env('PLAN_URL', ''));
  const telegramBotUsername = (): string => env('TELEGRAM_BOT_USERNAME', '');

  const clientConfig = (): FamoClientConfig => {
    const config: FamoClientConfig = {
      assetUrl: assetBase(),
      apiUrl: apiUrl(),
      telegramBotUsername: telegramBotUsername(),
    };

    const optionalUrls: Array<[keyof Omit<FamoClientConfig, 'assetUrl' | 'apiUrl' | 'telegramBotUsername'>, string]> = [
      ['publicUrl', publicUrl()],
      ['adminUrl', adminUrl()],
      ['dashboardUrl', dashboardUrl()],
      ['loginUrl', loginUrl()],
      ['planUrl', planUrl()],
    ];

    for (const [key, url] of optionalUrls) {
      if (url !== '') {
        config[key] = url;
      }
    }

    return config;
  };

  const configScript = (): string => {
    const json = safeJsonForScript(clientConfig());
    return `<script>window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, ${json}); window.FAMO_ASSET = function (path) { var base = (window.APP_CONFIG && window.APP_CONFIG.assetUrl) || ""; return base.replace(/\\/$/, "") + "/" + String(path).replace(/^\\//, ""); };</script>`;
  };

  return {
    env,
    appMode,
    isDev,
    asset,
    assetBase,
    apiUrl,
    publicUrl,
    adminUrl,
    dashboardUrl,
    loginUrl,
    planUrl,
    telegramBotUsername,
    clientConfig,
    configScript,
  };
}
