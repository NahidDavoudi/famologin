import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLoginPage, sanitizeReturnUrl } from './renderLoginPage.ts';

test('sanitizeReturnUrl allows same-origin relative paths and blocks external/protocol-relative URLs', () => {
  assert.equal(sanitizeReturnUrl('/dashboard/courses'), '/dashboard/courses');
  assert.equal(sanitizeReturnUrl('/admin/users?page=2#top'), '/admin/users?page=2#top');
  assert.equal(sanitizeReturnUrl('https://evil.example/phish'), '');
  assert.equal(sanitizeReturnUrl('//evil.example/phish'), '');
  assert.equal(sanitizeReturnUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeReturnUrl('/\\evil.example'), '');
  assert.equal(sanitizeReturnUrl('/dashboard', 'telegram'), '');
});

test('renderLoginPage omits Telegram widget and logs warning when TELEGRAM_BOT_USERNAME is unset', () => {
  const warnings: string[] = [];
  const html = renderLoginPage({
    env: {},
    returnUrl: '/dashboard/home',
    onMissingTelegramBot: (msg) => warnings.push(msg),
  });

  assert.equal(warnings.length, 1);
  assert.equal(html.includes('telegram-widget.js'), false);
  assert.equal(html.includes('window.FAMO_LOGIN_RETURN_URL = "/dashboard/home"'), true);
  assert.equal(html.includes('lang="fa" dir="rtl"'), true);
  assert.equal(html.includes('assets/js/login.js'), true);
});

test('renderLoginPage renders escaped Telegram widget when TELEGRAM_BOT_USERNAME is configured', () => {
  const warnings: string[] = [];
  const html = renderLoginPage({
    env: { TELEGRAM_BOT_USERNAME: 'FamoTestBot' },
    onMissingTelegramBot: (msg) => warnings.push(msg),
  });

  assert.equal(warnings.length, 0);
  assert.equal(html.includes('data-telegram-login="FamoTestBot"'), true);
  assert.equal(html.includes('https://telegram.org/js/telegram-widget.js?22'), true);
});
