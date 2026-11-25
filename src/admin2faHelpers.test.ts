import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAuthError,
  describeChannelPrompt,
  extractOtpDigits,
  formatWaitDuration,
  normalizeDigits,
  normalizeRecoveryCode,
  resolveChannelUiState,
} from '../assets/js/admin-2fa-helpers.js';

test('normalizeDigits converts Persian and Arabic-Indic numerals to ASCII', () => {
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeDigits('۱۲-٣٤-56'), '12-34-56');
  assert.equal(extractOtpDigits(' ۱۲۳-۴۵۶۷۸ '), '123456');
  assert.equal(normalizeRecoveryCode('  ABCD-۱۲۳۴  '), 'ABCD-1234');
});

test('formatWaitDuration formats seconds and minutes in calm Persian', () => {
  assert.equal(formatWaitDuration(45), '۴۵ ثانیه');
  assert.equal(formatWaitDuration(60), '۱ دقیقه');
  assert.equal(formatWaitDuration(125), '۲ دقیقه و ۵ ثانیه');
});

test('resolveChannelUiState enforces channel-specific secondary actions and resend visibility', () => {
  const smsState = resolveChannelUiState({
    channel: 'sms',
    destination_mask: '0912***89',
    sends_remaining: 2,
    max_sends: 3,
    available_channels: ['sms', 'email', 'totp'],
  });
  assert.equal(smsState.showResend, true);
  assert.equal(smsState.showSendViaEmail, true);
  assert.equal(smsState.showUseAuthenticator, true);
  assert.equal(smsState.resendExhausted, false);

  const emailState = resolveChannelUiState({
    channel: 'email',
    destination_mask: 'a***@famoacademy.ir',
    sends_remaining: 0,
    max_sends: 3,
    available_channels: ['sms', 'email', 'totp'],
  });
  assert.equal(emailState.showResend, true);
  assert.equal(emailState.showSendViaEmail, false);
  assert.equal(emailState.showUseAuthenticator, true);
  assert.equal(emailState.resendExhausted, true);

  const totpState = resolveChannelUiState({
    channel: 'totp',
    available_channels: ['sms', 'email', 'totp'],
  });
  assert.equal(totpState.showResend, false);
  assert.equal(totpState.showSendViaEmail, false);
  assert.equal(totpState.showUseAuthenticator, false);

  const recoveryState = resolveChannelUiState(
    { channel: 'sms', available_channels: ['sms', 'email', 'totp'] },
    { recoveryMode: true },
  );
  assert.equal(recoveryState.showResend, false);
  assert.equal(recoveryState.showSendViaEmail, false);
  assert.equal(recoveryState.showUseAuthenticator, false);
});

test('describeChannelPrompt reflects API channel_message_fa or channel-specific defaults', () => {
  const smsPrompt = describeChannelPrompt({ channel: 'sms', phone_mask: '0912***89' });
  assert.equal(smsPrompt.destinationMask, '0912***89');
  assert.equal(smsPrompt.message.includes('پیامک'), true);

  const emailPrompt = describeChannelPrompt({ channel: 'email', email_mask: 'a***@famoacademy.ir' });
  assert.equal(emailPrompt.destinationMask, 'a***@famoacademy.ir');
  assert.equal(emailPrompt.message.includes('ایمیل'), true);

  const totpPrompt = describeChannelPrompt({ channel: 'totp', phone_mask: '0912***89' });
  assert.equal(totpPrompt.destinationMask, null);
  assert.equal(totpPrompt.message.includes('اپلیکیشن احراز هویت'), true);
});

test('classifyAuthError returns calm generic errors for credentials, code, expiry, rate limit, network, and server', () => {
  const credErr = classifyAuthError({ status: 401, code: 'AUTH_ERROR', message: 'User not found' }, 'login');
  assert.equal(credErr.kind, 'invalid_credentials');
  assert.equal(credErr.message.includes('User not found'), false);

  const rateErr = classifyAuthError({ status: 429, code: 'RATE_LIMITED', retryAfter: 45 }, 'verify');
  assert.equal(rateErr.kind, 'rate_limit');
  assert.equal(rateErr.message.includes('۴۵ ثانیه'), true);

  const expiredErr = classifyAuthError({ status: 401, code: 'CODE_EXPIRED', message: 'Expired' }, 'verify');
  assert.equal(expiredErr.kind, 'expired_code');

  const netErr = classifyAuthError(new TypeError('Failed to fetch'), 'verify');
  assert.equal(netErr.kind, 'network');

  const srvErr = classifyAuthError({ status: 503, code: 'SERVICE_UNAVAILABLE' }, 'verify');
  assert.equal(srvErr.kind, 'server');
});
