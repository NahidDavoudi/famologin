import { createFamoConfig, safeJsonForScript, type EnvSource } from './config.ts';

export interface RenderLoginPageOptions {
  source?: unknown;
  returnUrl?: unknown;
  dir?: unknown;
  preview?: boolean;
  env?: EnvSource;
  onMissingTelegramBot?: (message: string) => void;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Mirrors index.php's return_url sanitization: allows only same-origin relative
 * paths starting with a single '/' and never protocol-relative or external URLs.
 */
export function sanitizeReturnUrl(rawReturnUrl: unknown, source?: unknown): string {
  const candidate = source === 'telegram' ? 'https://t.me/NadEdu_bot' : rawReturnUrl;

  if (typeof candidate !== 'string' || candidate === '') {
    return '';
  }

  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '';
  }

  try {
    const parsed = new URL(candidate, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return '';
    }
  } catch {
    return '';
  }

  return candidate;
}

function renderOtpSlots(): string {
  const slots: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const num = i + 1;
    const autoComplete = i === 0 ? 'one-time-code' : 'off';
    slots.push(
      `<input class="otp-digit-input" id="otpDigit${num}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${autoComplete}" data-otp-index="${i}" aria-label="رقم ${num} از ۶">`,
    );
  }
  return slots.join('\n                        ');
}

function renderPreviewToolbar(): string {
  return `
    <aside id="authPreviewToolbar" class="preview-toolbar" aria-label="پیش‌نمایش وضعیت‌های صفحه ورود و احراز هویت دو مرحله‌ای">
        <div class="preview-toolbar-head">
            <span>پیش‌نمایش تعاملی وضعیت‌های ورود، ثبت‌نام و احراز هویت دو مرحله‌ای</span>
            <button id="previewDirToggle" class="preview-state-btn" type="button">تغییر جهت به LTR</button>
        </div>
        <div class="preview-controls">
            <button class="preview-state-btn is-active" type="button" data-preview-state="credentials">۱. ورود</button>
            <button class="preview-state-btn" type="button" data-preview-state="credentials-loading">۱ب. در حال ارسال</button>
            <button class="preview-state-btn" type="button" data-preview-state="credentials-error">۱پ. خطای ورود</button>
            <button class="preview-state-btn" type="button" data-preview-state="register">ثبت‌نام</button>
            <button class="preview-state-btn" type="button" data-preview-state="sms">۲. پیامک + تایمر</button>
            <button class="preview-state-btn" type="button" data-preview-state="sms-ready">۵. آماده ارسال مجدد</button>
            <button class="preview-state-btn" type="button" data-preview-state="sms-exhausted">۵ب. اتمام سهمیه ارسال</button>
            <button class="preview-state-btn" type="button" data-preview-state="email">۳. ایمیل</button>
            <button class="preview-state-btn" type="button" data-preview-state="totp">۴. اپلیکیشن TOTP</button>
            <button class="preview-state-btn" type="button" data-preview-state="recovery">۷. کد بازیابی</button>
            <button class="preview-state-btn" type="button" data-preview-state="err-invalid">۸. کد نامعتبر</button>
            <button class="preview-state-btn" type="button" data-preview-state="err-expired">۸ب. کد منقضی</button>
            <button class="preview-state-btn" type="button" data-preview-state="err-ratelimit">۸پ. محدودیت تلاش</button>
            <button class="preview-state-btn" type="button" data-preview-state="err-network">۸ت. خطای شبکه</button>
            <button class="preview-state-btn" type="button" data-preview-state="err-server">۸ث. خطای سرور</button>
            <button class="preview-state-btn" type="button" data-preview-state="success">۹. موفقیت</button>
        </div>
    </aside>`;
}

export function renderLoginPage(options: RenderLoginPageOptions = {}): string {
  const config = createFamoConfig(options.env ?? process.env);
  const returnUrl = sanitizeReturnUrl(options.returnUrl, options.source);
  const telegramBotUsername = config.telegramBotUsername();
  const dir = options.dir === 'ltr' ? 'ltr' : 'rtl';
  const preview = Boolean(options.preview);

  if (telegramBotUsername === '') {
    const logFn = options.onMissingTelegramBot ?? ((msg: string) => console.warn(msg));
    logFn('famo login: TELEGRAM_BOT_USERNAME is not configured; Telegram Login Widget disabled.');
  }

  const telegramWidgetHtml =
    telegramBotUsername !== ''
      ? `
        <p id="telegramInstruction" class="telegram-instruction hidden">ابتدا با تلگرام تأیید کن</p>
        <div id="telegramLogin" class="telegram-widget-wrap">
            <script>
                window.onTelegramAuth = function (user) { window.dispatchEvent(new CustomEvent('famo:telegram-auth', { detail: user })); };
            </script>
            <script async
                src="https://telegram.org/js/telegram-widget.js?22"
                data-telegram-login="${escapeHtml(telegramBotUsername)}"
                data-size="large"
                data-onauth="onTelegramAuth(user)"
                data-request-access="write"></script>
        </div>`
      : '';

  const eyeClosedAsset = escapeHtml(config.asset('svg/eye-closed.svg', '../shared/svg/eye-closed.svg'));
  const logoAsset = escapeHtml(config.asset('images/logo.png', '../shared/images/logo.png'));
  const backToHomeHref = escapeHtml(`${config.publicUrl()}/index.php`);
  const pageTitle = 'ورود و ثبت‌نام | آموزشگاه فامو';
  const pageDescription =
    'ورود یکپارچه و ثبت‌نام در آموزشگاه فامو؛ هدایت خودکار به پنل متناسب با نقش کاربری.';

  return `<!doctype html>
<html lang="fa" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="${escapeHtml(pageDescription)}">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(pageDescription)}">
    <title>${escapeHtml(pageTitle)}</title>
    ${config.configScript()}
    <link rel="stylesheet" href="${escapeHtml(config.asset('css/tokens.css', '../shared/css/tokens.css'))}">
    <link rel="stylesheet" href="${escapeHtml(config.asset('css/output.css', '../shared/css/output.css'))}">
    <link rel="icon" type="image/png" sizes="16x16" href="${escapeHtml(config.asset('images/favicon-16.png', '../shared/images/favicon-16.png'))}">
    <link rel="icon" type="image/png" sizes="32x32" href="${escapeHtml(config.asset('images/favicon-32.png', '../shared/images/favicon-32.png'))}">
    <link rel="icon" type="image/png" sizes="96x96" href="${escapeHtml(config.asset('images/favicon-96.png', '../shared/images/favicon-96.png'))}">
    <link rel="stylesheet" href="/assets/css/login.css">
</head>
<body class="auth-body">
<main id="authApp" class="auth-shell"${preview ? ' data-preview="1"' : ''}>
    ${preview ? renderPreviewToolbar() : ''}
    <section class="auth-card" aria-labelledby="authCardTitle">
        <header class="auth-card-header">
            <div class="auth-brand-mark" aria-hidden="true">
                <img src="${logoAsset}" alt="" class="auth-brand-logo" referrerpolicy="no-referrer">
            </div>
            <h1 id="authCardTitle" class="auth-card-title">به فامو خوش آمدید</h1>
            <p id="authCardSubtitle" class="auth-card-subtitle">برای ورود به پنل خود، اطلاعات حساب را وارد کنید.</p>
        </header>
${telegramWidgetHtml}
        <div id="telegramHint" class="auth-alert auth-alert-error hidden" role="alert" aria-live="polite"></div>

        <div id="telegramChooser" class="telegram-panel hidden">
            <p id="telegramChooserMessage" class="telegram-panel-message"></p>
            <div class="telegram-panel-actions">
                <button id="telegramLoginChoice" class="primary-button" type="button">ورود به حساب موجود</button>
                <button id="telegramRegisterChoice" class="secondary-button" type="button">ثبت‌نام</button>
            </div>
        </div>

        <div id="telegramLinked" class="telegram-panel hidden">
            <p id="telegramLinkedMessage" class="telegram-panel-message"></p>
            <div class="telegram-panel-actions">
                <button id="telegramLinkedButton" class="primary-button" type="button">بازگشت به تلگرام</button>
            </div>
        </div>

        <div id="authTabs" class="auth-tabs" role="tablist" aria-label="احراز هویت">
            <button class="tab-btn active" id="loginTab" type="button" role="tab" aria-selected="true" aria-controls="loginFormContainer">ورود</button>
            <button class="tab-btn" id="registerTab" type="button" role="tab" aria-selected="false" aria-controls="registerFormContainer">ثبت‌نام</button>
        </div>

        <div id="formErrorSummary" class="auth-alert auth-alert-error hidden" role="alert" aria-live="assertive" aria-atomic="true" tabindex="-1">
            <svg class="auth-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="formErrorText" class="auth-alert-text"></span>
        </div>

        <div id="formSuccessSummary" class="auth-alert auth-alert-success hidden" role="status" aria-live="polite" aria-atomic="true">
            <svg class="auth-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span id="formSuccessText" class="auth-alert-text"></span>
        </div>

        <div id="loginFormContainer" role="tabpanel" aria-labelledby="loginTab">
            <form id="formLogin" class="auth-form" novalidate>
                <div class="input-group">
                    <label class="auth-label" for="loginUsername">نام کاربری یا شماره موبایل</label>
                    <div class="auth-input-wrap">
                        <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
                        <input class="auth-input" id="loginUsername" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <div class="input-group">
                    <label class="auth-label" for="loginPassword">رمز عبور</label>
                    <div class="auth-input-wrap">
                        <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <input class="auth-input auth-input-password" id="loginPassword" name="password" type="password" autocomplete="current-password" required>
                        <button class="password-toggle" type="button" data-password-target="loginPassword" aria-label="نمایش رمز عبور" aria-pressed="false">
                            <img src="${eyeClosedAsset}" alt="" class="password-toggle-icon" referrerpolicy="no-referrer">
                        </button>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <button class="primary-button" type="submit" aria-busy="false">
                    <span class="btn-spinner" aria-hidden="true"></span>
                    <svg class="btn-icon icon-md icon-directional" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    <span class="btn-text">ورود</span>
                    <span class="btn-loading-text">در حال بررسی…</span>
                </button>
            </form>
        </div>

        <div id="registerFormContainer" class="hidden" role="tabpanel" aria-labelledby="registerTab">
            <form id="formRegister" class="auth-form" novalidate>
                <div class="input-group">
                    <label class="auth-label" for="registerName">نام و نام خانوادگی</label>
                    <div class="auth-input-wrap">
                        <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
                        <input class="auth-input" id="registerName" name="name" type="text" minlength="3" autocomplete="name" required>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <div class="input-group">
                    <label class="auth-label" for="registerPhone">شماره موبایل</label>
                    <div class="auth-input-wrap">
                        <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        <input class="auth-input" id="registerPhone" name="phone" type="tel" pattern="09[0-9]{9}" autocomplete="tel" required>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <div class="input-group">
                    <label class="auth-label" for="registerNationalId">کد ملی</label>
                    <div class="auth-input-wrap">
                        <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                        <input class="auth-input" id="registerNationalId" name="nationalId" type="text" inputmode="numeric" pattern="[0-9]{10}" required>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <div class="auth-field-row">
                    <div class="input-group">
                        <label class="auth-label" for="registerGrade">پایه</label>
                        <select class="auth-select" id="registerGrade" name="grade" required>
                            <option value="">انتخاب پایه</option>
                            <option value="7">هفتم</option>
                            <option value="8">هشتم</option>
                            <option value="9">نهم</option>
                            <option value="10">دهم</option>
                            <option value="11">یازدهم</option>
                            <option value="12">دوازدهم</option>
                        </select>
                        <span class="error-message" role="alert"></span>
                    </div>

                    <div class="input-group" id="fieldGroup">
                        <label class="auth-label" for="registerField">رشته</label>
                        <select class="auth-select" id="registerField" name="field" required>
                            <option value="">انتخاب رشته</option>
                            <option value="تجربی">تجربی</option>
                            <option value="ریاضی">ریاضی</option>
                            <option value="انسانی">انسانی</option>
                            <option value="راهنمایی">راهنمایی</option>
                        </select>
                        <span class="error-message" role="alert"></span>
                    </div>
                </div>

                <div class="input-group">
                    <label class="auth-label" for="registerPassword">رمز عبور</label>
                    <div class="auth-input-wrap">
                        <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <input class="auth-input auth-input-password" id="registerPassword" name="password" type="password" minlength="4" autocomplete="new-password" required>
                        <button class="password-toggle" type="button" data-password-target="registerPassword" aria-label="نمایش رمز عبور" aria-pressed="false">
                            <img src="${eyeClosedAsset}" alt="" class="password-toggle-icon" referrerpolicy="no-referrer">
                        </button>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <button class="primary-button" type="submit" aria-busy="false">
                    <span class="btn-spinner" aria-hidden="true"></span>
                    <svg class="btn-icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                    <span class="btn-text">ثبت‌نام</span>
                    <span class="btn-loading-text">در حال ثبت‌نام…</span>
                </button>
            </form>
        </div>

        <div id="twoFactorContainer" class="twofa-panel hidden">
            <div class="twofa-context">
                <p id="twoFactorHint" class="twofa-channel-hint" aria-live="polite"></p>
                <p id="twoFactorDestination" class="twofa-destination hidden"></p>
            </div>

            <form id="formTwoFactor" class="auth-form" novalidate>
                <input id="twoFactorCode" name="code" type="hidden" value="">

                <div id="otpFieldGroup" class="input-group">
                    <fieldset class="otp-fieldset">
                        <legend class="otp-legend">کد تأیید ۶ رقمی</legend>
                        <div id="otpDigitsGroup" class="otp-slots">
                        ${renderOtpSlots()}
                        </div>
                    </fieldset>
                    <span class="error-message" role="alert"></span>
                </div>

                <div id="recoveryFieldGroup" class="input-group hidden">
                    <label class="auth-label" for="recoveryCodeInput">کد بازیابی یک‌بارمصرف</label>
                    <input class="auth-input recovery-input" id="recoveryCodeInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" data-helper-id="recoveryHelperText" aria-describedby="recoveryHelperText">
                    <p id="recoveryHelperText" class="field-helper">هر کد بازیابی فقط یک بار قابل استفاده است.</p>
                    <span class="error-message" role="alert"></span>
                </div>

                <button class="primary-button" type="submit" aria-busy="false">
                    <span class="btn-spinner" aria-hidden="true"></span>
                    <svg class="btn-icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                    <span class="btn-text">تأیید و ورود</span>
                    <span class="btn-loading-text">در حال تأیید…</span>
                </button>
            </form>

            <div id="twoFactorResendSection" class="twofa-resend-row">
                <button id="resendCodeButton" class="ghost-action-button" type="button" disabled>ارسال مجدد کد</button>
                <p id="resendRemainingMeta" class="twofa-sends-meta hidden" aria-live="polite"></p>
            </div>

            <div id="twoFactorDivider" class="twofa-divider" role="separator"></div>

            <div id="twoFactorSecondaryActions" class="twofa-secondary-actions">
                <button id="switchEmailButton" class="secondary-button" type="button">
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    <span>کد را دریافت نکردید؟ ارسال از طریق ایمیل</span>
                </button>
                <button id="switchTotpButton" class="secondary-button" type="button">
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                    <span>استفاده از اپلیکیشن احراز هویت</span>
                </button>
            </div>

            <div class="twofa-footer-links">
                <button id="toggleRecoveryButton" class="subtle-link-button" type="button">استفاده از کد بازیابی یک‌بارمصرف</button>
                <button id="cancelTwoFactor" class="subtle-link-button" type="button">بازگشت به ورود</button>
            </div>
        </div>

        <footer class="auth-card-footer">
            <a class="auth-back-link" href="${backToHomeHref}">
                <svg class="icon-sm icon-directional" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                <span>بازگشت به صفحه اصلی</span>
            </a>
        </footer>
    </section>
</main>
<script>window.FAMO_LOGIN_RETURN_URL = ${safeJsonForScript(returnUrl)};</script>
<script type="module" src="/assets/js/login.js"></script>
${preview ? '<script type="module" src="/assets/js/login-preview.js"></script>' : ''}
</body>
</html>
`;
}
