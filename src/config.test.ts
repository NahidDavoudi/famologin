import test from 'node:test';
import assert from 'node:assert/strict';
import { createFamoConfig, parseEnvContent, safeJsonForScript } from './config.ts';

test('parseEnvContent parses key-value pairs, ignores comments, and strips surrounding quotes', () => {
  const parsed = parseEnvContent(`
    # comment line
    API_URL="https://api.example.com"
    ASSET_URL='https://cdn.example.com/'
    TELEGRAM_BOT_USERNAME=FamoBot
    EMPTY_VAL=
    INVALID_LINE
  `);

  assert.equal(parsed.API_URL, 'https://api.example.com');
  assert.equal(parsed.ASSET_URL, 'https://cdn.example.com/');
  assert.equal(parsed.TELEGRAM_BOT_USERNAME, 'FamoBot');
  assert.equal(parsed.EMPTY_VAL, '');
  assert.equal('INVALID_LINE' in parsed, false);
});

test('createFamoConfig resolves production defaults and appends /api/v1 once', () => {
  const cfg = createFamoConfig({});
  assert.equal(cfg.appMode(), 'production');
  assert.equal(cfg.isDev(), false);
  assert.equal(cfg.apiUrl(), 'https://api.famoacademy.ir/api/v1');
  assert.equal(
    cfg.asset('css/tokens.css', '../shared/css/tokens.css'),
    'https://assets.famoacademy.ir/css/tokens.css',
  );

  const customCfg = createFamoConfig({
    API_URL: 'https://custom.example.com/api/v1/',
    APP_MODE: 'development',
    PUBLIC_URL: 'https://famoacademy.ir/',
  });
  assert.equal(customCfg.isDev(), true);
  assert.equal(customCfg.apiUrl(), 'https://custom.example.com/api/v1');
  assert.equal(
    customCfg.asset('css/tokens.css', '../shared/css/tokens.css'),
    '../shared/css/tokens.css',
  );
  assert.equal(customCfg.clientConfig().publicUrl, 'https://famoacademy.ir');
});

test('safeJsonForScript escapes HTML-sensitive characters to prevent script breakout', () => {
  const encoded = safeJsonForScript({ payload: '</script>&\'"' });
  assert.equal(encoded.includes('</script>'), false);
  assert.equal(encoded.includes('\\u003C/script\\u003E'), true);
  assert.equal(encoded.includes('\\u0026'), true);
  assert.equal(encoded.includes('\\u0027'), true);
});
