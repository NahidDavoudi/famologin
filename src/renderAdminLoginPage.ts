import { createFamoConfig, type EnvSource } from './config.ts';
import { escapeHtml, sanitizeReturnUrl } from './renderLoginPage.ts';

export interface RenderAdminLoginPageOptions {
  returnUrl?: unknown;
  dir?: unknown;
  preview?: boolean;
  env?: EnvSource;
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
    <aside id="adminPreviewToolbar" class="preview-toolbar" aria-label="پیش‌نمایش وضعیت‌های صفحه ورود مدیر">
        <div class="preview-toolbar-head">
            <span>پیش‌نمایش تعاملی وضعیت‌های ورود و احراز هویت دو مرحله‌ای</span>
            <button id="previewDirToggle" class="preview-state-btn" type="button">تغییر جهت به LTR</button>
        </div>
        <div class="preview-controls">
            <button class="preview-state-btn is-active" type="button" data-preview-state="credentials">۱. ورود</button>
            <button class="preview-state-btn" type="button" data-preview-state="credentials-loading">۱ب. در حال ارسال</button>
            <button class="preview-state-btn" type="button" data-preview-state="credentials-error">۱پ. خطای ورود</button>
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

export function renderAdminLoginPage(options: RenderAdminLoginPageOptions = {}): string {
  const config = createFamoConfig(options.env ?? process.env);
  const client = config.clientConfig();
  const returnUrl = sanitizeReturnUrl(options.returnUrl);
  const dir = options.dir === 'ltr' ? 'ltr' : 'rtl';
  const preview = Boolean(options.preview);

  const pageTitle = 'ورود مدیران | آموزشگاه فامو';
  const pageDescription = 'ورود امن به پنل مدیریت آموزشگاه فامو با احراز هویت دو مرحله‌ای.';
  const eyeClosedAsset = escapeHtml(config.asset('svg/eye-closed.svg', '../shared/svg/eye-closed.svg'));
  const logoAsset = escapeHtml(config.asset('images/logo.png', '../shared/images/logo.png'));
  const backToHomeHref = escapeHtml(`${config.publicUrl()}/index.php`);

  const dataAttrs = [
    `data-asset-url="${escapeHtml(client.assetUrl)}"`,
    `data-api-url="${escapeHtml(client.apiUrl)}"`,
    client.publicUrl ? `data-public-url="${escapeHtml(client.publicUrl)}"` : '',
    client.adminUrl ? `data-admin-url="${escapeHtml(client.adminUrl)}"` : '',
    client.dashboardUrl ? `data-dashboard-url="${escapeHtml(client.dashboardUrl)}"` : '',
    client.loginUrl ? `data-login-url="${escapeHtml(client.loginUrl)}"` : '',
    client.planUrl ? `data-plan-url="${escapeHtml(client.planUrl)}"` : '',
    returnUrl ? `data-return-url="${escapeHtml(returnUrl)}"` : '',
    preview ? 'data-preview="1"' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
    <link rel="stylesheet" href="${escapeHtml(config.asset('css/tokens.css', '../shared/css/tokens.css'))}">
    <link rel="stylesheet" href="${escapeHtml(config.asset('css/output.css', '../shared/css/output.css'))}">
    <link rel="icon" type="image/png" sizes="16x16" href="${escapeHtml(config.asset('images/favicon-16.png', '../shared/images/favicon-16.png'))}">
    <link rel="icon" type="image/png" sizes="32x32" href="${escapeHtml(config.asset('images/favicon-32.png', '../shared/images/favicon-32.png'))}">
    <link rel="icon" type="image/png" sizes="96x96" href="${escapeHtml(config.asset('images/favicon-96.png', '../shared/images/favicon-96.png'))}">
    <link rel="stylesheet" href="/assets/css/admin-login.css">
</head>
<body class="admin-login-body">
<main id="adminLoginApp" class="admin-login-shell" ${dataAttrs}>
    ${preview ? renderPreviewToolbar() : ''}
    <section class="admin-login-card" aria-labelledby="adminCardTitle">
        <header class="admin-card-header">
            <div class="admin-brand-mark" aria-hidden="true">
                <img src="${logoAsset}" alt="" class="admin-brand-logo" referrerpolicy="no-referrer">
            </div>
            <h1 id="adminCardTitle" class="admin-card-title">ورود به پنل مدیریت</h1>
            <p id="adminCardSubtitle" class="admin-card-subtitle">برای ورود به پنل مدیریت آموزشگاه فامو، مشخصات حساب خود را وارد کنید.</p>
        </header>

        <div id="formErrorSummary" class="admin-alert admin-alert-error hidden" role="alert" aria-live="assertive" aria-atomic="true" tabindex="-1">
            <svg class="admin-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="formErrorText" class="admin-alert-text"></span>
        </div>

        <div id="formSuccessSummary" class="admin-alert admin-alert-success hidden" role="status" aria-live="polite" aria-atomic="true">
            <svg class="admin-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span id="formSuccessText" class="admin-alert-text"></span>
        </div>

        <div id="loginFormContainer">
            <form id="formLogin" class="admin-form" novalidate>
                <div class="input-group">
                    <label class="admin-label" for="loginUsername">نام کاربری یا شماره موبایل</label>
                    <div class="admin-input-wrap">
                        <svg class="admin-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
                        <input class="admin-input" id="loginUsername" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <div class="input-group">
                    <label class="admin-label" for="loginPassword">رمز عبور</label>
                    <div class="admin-input-wrap">
                        <svg class="admin-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <input class="admin-input admin-input-password" id="loginPassword" name="password" type="password" autocomplete="current-password" required>
                        <button class="password-toggle" type="button" data-password-target="loginPassword" aria-label="نمایش رمز عبور" aria-pressed="false">
                            <img src="${eyeClosedAsset}" alt="" class="password-toggle-icon" referrerpolicy="no-referrer">
                        </button>
                    </div>
                    <span class="error-message" role="alert"></span>
                </div>

                <button class="primary-button" type="submit" aria-busy="false">
                    <span class="btn-spinner" aria-hidden="true"></span>
                    <svg class="btn-icon icon-md icon-directional" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    <span class="btn-text">ادامه</span>
                    <span class="btn-loading-text">در حال بررسی…</span>
                </button>
            </form>
        </div>

        <div id="twoFactorContainer" class="twofa-panel hidden">
            <div class="twofa-context">
                <p id="twoFactorHint" class="twofa-channel-hint" aria-live="polite"></p>
                <p id="twoFactorDestination" class="twofa-destination hidden"></p>
            </div>

            <form id="formTwoFactor" class="admin-form" novalidate>
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
                    <label class="admin-label" for="recoveryCodeInput">کد بازیابی یک‌بارمصرف</label>
                    <input class="admin-input recovery-input" id="recoveryCodeInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" data-helper-id="recoveryHelperText" aria-describedby="recoveryHelperText">
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

        <footer class="admin-card-footer">
            <a class="admin-back-link" href="${backToHomeHref}">
                <svg class="icon-sm icon-directional" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                <span>بازگشت به صفحه اصلی</span>
            </a>
        </footer>
    </section>
</main>
<script src="/assets/js/admin-config.js" defer></script>
<script type="module" src="/assets/js/admin-login.js"></script>
${preview ? '<script type="module" src="/assets/js/admin-login-preview.js"></script>' : ''}
</body>
</html>
`;
}
