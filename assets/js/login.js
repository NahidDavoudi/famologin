import API, { onReady } from './api.js';
import {
    classifyAuthError,
    describeChannelPrompt,
    extractOtpDigits,
    formatWaitDuration,
    normalizeDigits,
    normalizeRecoveryCode,
    resolveChannelUiState,
    toPersianDigits,
} from './admin-2fa-helpers.js';

const OTP_LENGTH = 6;
const TELEGRAM_HINT_TEXT = 'اگر ویجت باز نشد، اتصال به تلگرام/فیلترشکن را بررسی و دوباره تلاش کنید.';
const TELEGRAM_RESET_CODES = ['TELEGRAM_TICKET_INVALID', 'TELEGRAM_AUTH_INVALID', 'TELEGRAM_REPLAY'];
const TELEGRAM_RESET_TEXT = 'نشست تلگرام منقضی شد. لطفاً دوباره با تلگرام تأیید کنید.';

function resolveAsset(path) {
    if (typeof window.FAMO_ASSET === 'function') {
        return window.FAMO_ASSET(path);
    }
    const base = (window.APP_CONFIG && window.APP_CONFIG.assetUrl) || '';
    return String(base).replace(/\/$/, '') + '/' + String(path).replace(/^\//, '');
}

/**
 * Role-based post-login destination resolver.
 * Students route to dashboardUrl; admins, supporters, and teachers route to adminUrl.
 */
function destination(user) {
    const isStudent = user && user.role === 'student';
    const roleHome = isStudent
        ? window.APP_CONFIG?.dashboardUrl
        : window.APP_CONFIG?.adminUrl;

    // Only these panel segments may be honored from a return URL, so a student
    // can never be bounced back into an admin-only guard.
    const panelHomes = isStudent
        ? { dashboard: window.APP_CONFIG?.dashboardUrl }
        : { admin: window.APP_CONFIG?.adminUrl, plan: window.APP_CONFIG?.planUrl };

    const returnUrl = window.FAMO_LOGIN_RETURN_URL;
    if (returnUrl) {
        try {
            const parsed = new URL(returnUrl, window.location.origin);
            const segments = parsed.pathname.split('/').filter(Boolean);
            if (parsed.origin === window.location.origin) {
                for (let i = segments.length - 1; i >= 0; i -= 1) {
                    const home = panelHomes[segments[i]];
                    if (home) {
                        const panelPath = segments.slice(i + 1).join('/');
                        const suffix = [panelPath, parsed.search, parsed.hash].filter(Boolean).join('');
                        return `${home}/${suffix}`;
                    }
                }
            }
        } catch {
            // Invalid return URLs fall back to the role's configured panel home.
        }
    }

    return roleHome || (isStudent ? '/dashboard/' : '/admin/');
}

function initUnifiedAuth() {
    const root = document.getElementById('authApp');
    if (!root) return;

    const $ = (selector) => document.querySelector(selector);

    const cardTitle = $('#authCardTitle');
    const cardSubtitle = $('#authCardSubtitle');
    const loginBox = $('#loginFormContainer');
    const registerBox = $('#registerFormContainer');
    const twoFactorBox = $('#twoFactorContainer');
    const authTabs = $('#authTabs');
    const loginTab = $('#loginTab');
    const registerTab = $('#registerTab');

    const formLogin = $('#formLogin');
    const formRegister = $('#formRegister');
    const formTwoFactor = $('#formTwoFactor');
    const usernameInput = $('#loginUsername');
    const passwordInput = $('#loginPassword');
    const loginSubmitBtn = formLogin ? formLogin.querySelector('button[type="submit"]') : null;
    const registerSubmitBtn = formRegister ? formRegister.querySelector('button[type="submit"]') : null;
    const verifySubmitBtn = formTwoFactor ? formTwoFactor.querySelector('button[type="submit"]') : null;

    const errorBox = $('#formErrorSummary');
    const errorBoxText = $('#formErrorText');
    const successBox = $('#formSuccessSummary');
    const successBoxText = $('#formSuccessText');

    const telegramLogin = $('#telegramLogin');
    const telegramHintBox = $('#telegramHint');
    const telegramChooser = $('#telegramChooser');
    const telegramLinked = $('#telegramLinked');
    const telegramInstruction = $('#telegramInstruction');

    const twoFactorHint = $('#twoFactorHint');
    const twoFactorDestination = $('#twoFactorDestination');
    const otpGroupWrap = $('#otpFieldGroup');
    const otpInputs = Array.from(document.querySelectorAll('.otp-digit-input'));
    const hiddenCodeInput = $('#twoFactorCode');
    const recoveryGroupWrap = $('#recoveryFieldGroup');
    const recoveryInput = $('#recoveryCodeInput');

    const resendSection = $('#twoFactorResendSection');
    const resendBtn = $('#resendCodeButton');
    const resendRemainingMeta = $('#resendRemainingMeta');
    const secondaryDivider = $('#twoFactorDivider');
    const secondaryActionsWrap = $('#twoFactorSecondaryActions');
    const switchEmailBtn = $('#switchEmailButton');
    const switchTotpBtn = $('#switchTotpButton');
    const toggleRecoveryBtn = $('#toggleRecoveryButton');
    const cancelTwoFactorBtn = $('#cancelTwoFactor');

    const TELEGRAM_SOURCE = new URLSearchParams(window.location.search).get('source') === 'telegram';
    const previewModeActive = root.dataset.preview === '1';

    let currentMode = 'login';
    let currentChallenge = null;
    let recoveryMode = false;
    let telegramTicket = null;
    let telegram2fa = null;

    let isLoginInFlight = false;
    let isRegisterInFlight = false;
    let isVerifyInFlight = false;
    let isChannelOpInFlight = false;
    let lastAutoSubmittedCode = null;

    let cooldownRemaining = 0;
    let cooldownTimerId = null;
    let lockoutRemaining = 0;
    let lockoutTimerId = null;
    let redirectTimerId = null;

    let transport = {
        login: (username, password) => API.login(username, password),
        register: (data) => API.register(data),
        verify2fa: (code, options) => API.verify2fa(code, options),
        resend2fa: () => API.resend2fa(),
        switch2faChannel: (channel) => API.switch2faChannel(channel),
        telegramVerify: (detail) => API.telegramVerify(detail),
        telegramLink: (payload) => API.telegramLink(payload),
        telegramRegister: (payload) => API.telegramRegister(payload),
        telegramVerify2fa: (payload) => API.telegramVerify2fa(payload),
        getMe: () => API.getMe(),
        cancel2fa: () => API.cancel2fa(),
        redirect: (url) => window.location.assign(url),
    };

    function clearTimers() {
        if (cooldownTimerId !== null) {
            window.clearInterval(cooldownTimerId);
            cooldownTimerId = null;
        }
        if (lockoutTimerId !== null) {
            window.clearInterval(lockoutTimerId);
            lockoutTimerId = null;
        }
        if (redirectTimerId !== null) {
            window.clearTimeout(redirectTimerId);
            redirectTimerId = null;
        }
    }

    function clearMessages() {
        if (errorBox) {
            errorBox.classList.add('hidden');
            errorBox.classList.remove('auth-alert-warning');
            errorBox.classList.add('auth-alert-error');
        }
        if (errorBoxText) errorBoxText.textContent = '';
        if (successBox) successBox.classList.add('hidden');
        if (successBoxText) successBoxText.textContent = '';
    }

    function showError(message, options = {}) {
        if (!errorBox || !errorBoxText) return;
        const isWarning = options.tone === 'warning';
        errorBox.classList.toggle('auth-alert-warning', isWarning);
        errorBox.classList.toggle('auth-alert-error', !isWarning);
        errorBoxText.textContent = message;
        errorBox.classList.remove('hidden');
        if (successBox) successBox.classList.add('hidden');
        if (options.focus !== false) {
            errorBox.focus();
        }
    }

    function showSuccess(message) {
        if (!successBox || !successBoxText) return;
        successBoxText.textContent = message;
        successBox.classList.remove('hidden');
        if (errorBox) errorBox.classList.add('hidden');
    }

    function fieldErrorMessage(input) {
        if (input.validity.valueMissing) return 'این فیلد الزامی است.';
        if (input.validity.tooShort) return `حداقل ${toPersianDigits(input.minLength)} کاراکتر وارد کنید.`;
        if (input.validity.patternMismatch || input.validity.typeMismatch) return 'قالب واردشده صحیح نیست.';
        return 'مقدار واردشده صحیح نیست.';
    }

    function setFieldError(input, message) {
        if (!input) return;
        const group = input.closest('.input-group');
        const messageEl = group ? group.querySelector('.error-message') : null;
        if (!group || !messageEl) return;
        if (message) {
            if (!messageEl.id) messageEl.id = `${input.id || input.name}Error`;
            messageEl.textContent = message;
            group.classList.add('error');
            input.setAttribute('aria-invalid', 'true');
            input.setAttribute('aria-describedby', messageEl.id);
        } else {
            messageEl.textContent = '';
            group.classList.remove('error');
            input.removeAttribute('aria-invalid');
            const helperId = input.dataset.helperId || '';
            if (helperId) {
                input.setAttribute('aria-describedby', helperId);
            } else {
                input.removeAttribute('aria-describedby');
            }
        }
    }

    function setOtpGroupError(message) {
        if (!otpGroupWrap) return;
        const messageEl = otpGroupWrap.querySelector('.error-message');
        if (!messageEl) return;
        if (message) {
            messageEl.textContent = message;
            otpGroupWrap.classList.add('error');
            otpInputs.forEach((el) => el.setAttribute('aria-invalid', 'true'));
        } else {
            messageEl.textContent = '';
            otpGroupWrap.classList.remove('error');
            otpInputs.forEach((el) => el.removeAttribute('aria-invalid'));
        }
    }

    function setButtonLoading(button, loading) {
        if (!button) return;
        button.classList.toggle('is-loading', loading);
        button.disabled = loading || lockoutRemaining > 0;
        button.setAttribute('aria-busy', loading ? 'true' : 'false');
    }

    function updateLockoutControls() {
        const locked = lockoutRemaining > 0;
        if (loginSubmitBtn && !isLoginInFlight) loginSubmitBtn.disabled = locked;
        if (registerSubmitBtn && !isRegisterInFlight) registerSubmitBtn.disabled = locked;
        if (verifySubmitBtn && !isVerifyInFlight) verifySubmitBtn.disabled = locked;
    }

    function startLockoutCountdown(seconds) {
        if (lockoutTimerId !== null) {
            window.clearInterval(lockoutTimerId);
            lockoutTimerId = null;
        }
        lockoutRemaining = Math.max(0, Math.ceil(Number(seconds) || 0));
        updateLockoutControls();
        if (lockoutRemaining <= 0) return;

        lockoutTimerId = window.setInterval(() => {
            lockoutRemaining -= 1;
            if (lockoutRemaining <= 0) {
                lockoutRemaining = 0;
                window.clearInterval(lockoutTimerId);
                lockoutTimerId = null;
                updateLockoutControls();
                clearMessages();
                return;
            }
            const waitText = formatWaitDuration(lockoutRemaining);
            showError(
                `تعداد تلاش‌ها بیش از حد مجاز است. لطفاً پس از ${waitText} دوباره تلاش کنید.`,
                { tone: 'warning', focus: false },
            );
        }, 1000);
    }

    function getOtpValue() {
        return otpInputs.map((el) => extractOtpDigits(el.value, 1)).join('');
    }

    function syncHiddenCode() {
        if (!hiddenCodeInput) return;
        hiddenCodeInput.value = recoveryMode
            ? normalizeRecoveryCode(recoveryInput ? recoveryInput.value : '')
            : getOtpValue();
    }

    function updateFilledStyles() {
        otpInputs.forEach((el) => {
            el.classList.toggle('is-filled', el.value.length > 0);
        });
    }

    function clearOtpInputs() {
        otpInputs.forEach((el) => {
            el.value = '';
            el.classList.remove('is-filled');
        });
        lastAutoSubmittedCode = null;
        setOtpGroupError(null);
        syncHiddenCode();
    }

    function clearRecoveryInput() {
        if (recoveryInput) {
            recoveryInput.value = '';
            setFieldError(recoveryInput, null);
        }
        syncHiddenCode();
    }

    function focusActiveCodeInput() {
        if (currentMode !== '2fa') return;
        if (recoveryMode) {
            if (recoveryInput) recoveryInput.focus();
            return;
        }
        if (otpInputs[0]) {
            otpInputs[0].focus();
        }
    }

    function renderResendButton() {
        if (!resendBtn || !resendSection || !resendRemainingMeta) return;
        if (telegram2fa) {
            resendSection.classList.add('hidden');
            return;
        }
        const ui = resolveChannelUiState(currentChallenge, { recoveryMode });
        resendSection.classList.toggle('hidden', !ui.showResend);
        if (!ui.showResend) return;

        if (ui.resendExhausted) {
            resendBtn.disabled = true;
            resendBtn.textContent = 'سقف ارسال مجدد تکمیل شده است';
        } else if (isChannelOpInFlight) {
            resendBtn.disabled = true;
            resendBtn.textContent = 'در حال ارسال مجدد…';
        } else if (cooldownRemaining > 0) {
            resendBtn.disabled = true;
            resendBtn.textContent = `ارسال مجدد کد (${toPersianDigits(cooldownRemaining)} ثانیه)`;
        } else {
            resendBtn.disabled = false;
            resendBtn.textContent = 'ارسال مجدد کد';
        }

        if (ui.sendsRemaining !== null) {
            if (ui.resendExhausted) {
                resendRemainingMeta.textContent = 'برای ادامه می‌توانید از اپلیکیشن احراز هویت یا کد بازیابی استفاده کنید.';
            } else if (ui.maxSends !== null) {
                resendRemainingMeta.textContent = `${toPersianDigits(ui.sendsRemaining)} از ${toPersianDigits(ui.maxSends)} ارسال در این نشست باقی مانده است`;
            } else {
                resendRemainingMeta.textContent = `${toPersianDigits(ui.sendsRemaining)} ارسال دیگر باقی مانده است`;
            }
            resendRemainingMeta.classList.remove('hidden');
        } else {
            resendRemainingMeta.textContent = '';
            resendRemainingMeta.classList.add('hidden');
        }
    }

    function startResendCooldown(seconds) {
        if (cooldownTimerId !== null) {
            window.clearInterval(cooldownTimerId);
            cooldownTimerId = null;
        }
        if (telegram2fa) {
            cooldownRemaining = 0;
            renderResendButton();
            return;
        }
        const ui = resolveChannelUiState(currentChallenge, { recoveryMode });
        if (!ui.showResend || ui.resendExhausted) {
            cooldownRemaining = 0;
            renderResendButton();
            return;
        }

        cooldownRemaining = Math.max(0, Math.ceil(Number(seconds) || 0));
        renderResendButton();
        if (cooldownRemaining <= 0) return;

        cooldownTimerId = window.setInterval(() => {
            cooldownRemaining -= 1;
            if (cooldownRemaining <= 0) {
                cooldownRemaining = 0;
                window.clearInterval(cooldownTimerId);
                cooldownTimerId = null;
            }
            renderResendButton();
        }, 1000);
    }

    function renderTwoFactorStep(options = {}) {
        const isTelegram2fa = Boolean(telegram2fa);
        const ui = resolveChannelUiState(currentChallenge, { recoveryMode });
        const prompt = describeChannelPrompt(currentChallenge);

        if (cardTitle) {
            cardTitle.textContent = recoveryMode ? 'ورود با کد بازیابی' : prompt.title;
        }
        if (cardSubtitle) {
            cardSubtitle.textContent = recoveryMode
                ? 'یکی از کدهای بازیابی یک‌بارمصرف حساب خود را وارد کنید.'
                : 'مرحله دوم احراز هویت آموزشگاه فامو';
        }

        if (twoFactorHint) {
            twoFactorHint.textContent = recoveryMode
                ? 'کدهای بازیابی هنگام راه‌اندازی احراز هویت دو مرحله‌ای ذخیره شده‌اند.'
                : prompt.message;
        }
        if (twoFactorDestination) {
            if (!recoveryMode && ui.destinationMask) {
                twoFactorDestination.textContent = ui.destinationMask;
                twoFactorDestination.classList.remove('hidden');
            } else {
                twoFactorDestination.textContent = '';
                twoFactorDestination.classList.add('hidden');
            }
        }

        if (otpGroupWrap) otpGroupWrap.classList.toggle('hidden', recoveryMode);
        if (recoveryGroupWrap) recoveryGroupWrap.classList.toggle('hidden', !recoveryMode);

        const showSendEmail = !isTelegram2fa && ui.showSendViaEmail;
        const showUseTotp = !isTelegram2fa && ui.showUseAuthenticator;

        if (switchEmailBtn) {
            switchEmailBtn.classList.toggle('hidden', !showSendEmail);
            switchEmailBtn.disabled = isChannelOpInFlight || isVerifyInFlight;
        }
        if (switchTotpBtn) {
            switchTotpBtn.classList.toggle('hidden', !showUseTotp);
            switchTotpBtn.disabled = isChannelOpInFlight || isVerifyInFlight;
        }

        const hasSecondary = showSendEmail || showUseTotp;
        if (secondaryActionsWrap) secondaryActionsWrap.classList.toggle('hidden', !hasSecondary);
        if (secondaryDivider) secondaryDivider.classList.toggle('hidden', !hasSecondary);

        if (toggleRecoveryBtn) {
            toggleRecoveryBtn.classList.toggle('hidden', isTelegram2fa);
            toggleRecoveryBtn.textContent = recoveryMode
                ? 'بازگشت به کد تأیید ۶ رقمی'
                : 'استفاده از کد بازیابی یک‌بارمصرف';
            toggleRecoveryBtn.disabled = isVerifyInFlight || isChannelOpInFlight;
        }

        renderResendButton();
        syncHiddenCode();

        if (options.focus !== false) {
            window.requestAnimationFrame(() => focusActiveCodeInput());
        }
    }

    function setTelegramGate(locked) {
        if (locked) {
            if (authTabs) authTabs.classList.add('hidden');
            if (loginBox) loginBox.classList.add('hidden');
            if (registerBox) registerBox.classList.add('hidden');
            if (twoFactorBox) twoFactorBox.classList.add('hidden');
            if (telegramInstruction) telegramInstruction.classList.remove('hidden');
        } else {
            if (authTabs) authTabs.classList.remove('hidden');
            if (telegramInstruction) telegramInstruction.classList.add('hidden');
        }
    }

    function setMode(mode, options = {}) {
        currentMode = mode;
        const is2fa = mode === '2fa';

        if (!is2fa) {
            currentChallenge = null;
            recoveryMode = false;
            isVerifyInFlight = false;
            isChannelOpInFlight = false;
            clearTimers();
            cooldownRemaining = 0;
            lockoutRemaining = 0;
            clearOtpInputs();
            clearRecoveryInput();
            setButtonLoading(loginSubmitBtn, false);
            setButtonLoading(registerSubmitBtn, false);
            setButtonLoading(verifySubmitBtn, false);
        }

        if (authTabs) authTabs.classList.toggle('hidden', is2fa);
        if (loginBox) loginBox.classList.toggle('hidden', mode !== 'login');
        if (registerBox) registerBox.classList.toggle('hidden', mode !== 'register');
        if (twoFactorBox) twoFactorBox.classList.toggle('hidden', !is2fa);

        if (loginTab) {
            loginTab.classList.toggle('active', mode === 'login');
            loginTab.setAttribute('aria-selected', mode === 'login' ? 'true' : 'false');
        }
        if (registerTab) {
            registerTab.classList.toggle('active', mode === 'register');
            registerTab.setAttribute('aria-selected', mode === 'register' ? 'true' : 'false');
        }

        if (!is2fa) {
            if (cardTitle) {
                cardTitle.textContent = mode === 'register' ? 'ایجاد حساب کاربری' : 'به فامو خوش آمدید';
            }
            if (cardSubtitle) {
                cardSubtitle.textContent =
                    mode === 'register'
                        ? 'مشخصات خود را برای ثبت‌نام در آموزشگاه فامو وارد کنید.'
                        : 'برای ورود به پنل خود، اطلاعات حساب را وارد کنید.';
            }
        }

        document
            .querySelectorAll('#formLogin input, #formLogin select, #formRegister input, #formRegister select')
            .forEach((input) => setFieldError(input, null));

        if (options.clearMessages !== false) {
            clearMessages();
        }
    }

    function enterTwoFactorStep(challenge, options = {}) {
        currentChallenge = { ...challenge };
        recoveryMode = Boolean(options.recoveryMode);
        isVerifyInFlight = false;
        isChannelOpInFlight = false;
        clearOtpInputs();
        clearRecoveryInput();
        setButtonLoading(loginSubmitBtn, false);
        setButtonLoading(verifySubmitBtn, false);

        setMode('2fa', { clearMessages: options.clearMessages !== false });
        renderTwoFactorStep({ focus: options.focus !== false });

        const cooldownSeconds =
            options.cooldownSeconds !== undefined
                ? options.cooldownSeconds
                : (challenge.resend_cooldown_seconds ?? 60);
        startResendCooldown(cooldownSeconds);
    }

    function resetTelegramFlow(message) {
        telegramTicket = null;
        telegram2fa = null;
        if (telegramChooser) telegramChooser.classList.add('hidden');
        if (telegramLinked) telegramLinked.classList.add('hidden');
        if (telegramHintBox) telegramHintBox.classList.add('hidden');
        if (telegramLogin) telegramLogin.classList.remove('hidden');
        if (TELEGRAM_SOURCE) setTelegramGate(true);
        else setMode('login');
        if (message) showError(message);
    }

    function handleAuthSuccess(result) {
        clearTimers();
        const remainingRecovery =
            typeof result.remaining_recovery_codes === 'number'
                ? result.remaining_recovery_codes
                : null;
        const suffix =
            remainingRecovery !== null
                ? ` (${toPersianDigits(remainingRecovery)} کد بازیابی باقی مانده است)`
                : '';
        showSuccess(`ورود با موفقیت انجام شد. در حال انتقال به پنل شما…${suffix}`);

        if (loginSubmitBtn) loginSubmitBtn.disabled = true;
        if (registerSubmitBtn) registerSubmitBtn.disabled = true;
        if (verifySubmitBtn) verifySubmitBtn.disabled = true;

        const targetUrl = destination(result.user);
        redirectTimerId = window.setTimeout(() => {
            transport.redirect(targetUrl);
        }, 450);
    }

    function finishTelegram(data) {
        telegramTicket = null;
        telegram2fa = null;
        if (data.bot_redirect_url) {
            transport.redirect(data.bot_redirect_url);
            return;
        }
        showSuccess('اتصال با موفقیت انجام شد. در حال انتقال…');
        redirectTimerId = window.setTimeout(() => {
            transport.redirect(destination(data.user));
        }, 350);
    }

    function showTelegramChooser(telegram) {
        const name = telegram && (telegram.first_name || telegram.username);
        const msgEl = $('#telegramChooserMessage');
        if (msgEl) {
            msgEl.textContent = name
                ? `حساب تلگرام «${name}» تأیید شد. برای اتصال، یکی از گزینه‌ها را انتخاب کنید.`
                : 'حساب تلگرام تأیید شد. برای اتصال، یکی از گزینه‌ها را انتخاب کنید.';
        }
        if (telegramLinked) telegramLinked.classList.add('hidden');
        if (telegramChooser) telegramChooser.classList.remove('hidden');
    }

    function showTelegramLinked(data) {
        if (telegramLogin) telegramLogin.classList.add('hidden');
        if (telegramHintBox) telegramHintBox.classList.add('hidden');
        if (telegramChooser) telegramChooser.classList.add('hidden');
        if (telegramLinked) telegramLinked.classList.remove('hidden');
        const message = $('#telegramLinkedMessage');
        const button = $('#telegramLinkedButton');
        if (!message || !button) return;
        if (data.bot_redirect_url) {
            message.textContent =
                'این حساب تلگرام قبلاً به فامو متصل شده است. برای بازگشت به تلگرام روی دکمه زیر بزنید.';
            button.classList.remove('hidden');
            button.onclick = () => transport.redirect(data.bot_redirect_url);
        } else {
            message.textContent =
                'این حساب تلگرام قبلاً به فامو متصل شده است. برای بازگشت، از ربات تلگرام استفاده کنید.';
            button.classList.add('hidden');
            button.onclick = null;
        }
    }

    function validateRegisterForm(form) {
        let valid = true;
        form.querySelectorAll('input, select').forEach((input) => {
            if (input.name === 'phone' || input.name === 'nationalId') {
                input.value = normalizeDigits(input.value).trim();
            }
            if (input.checkValidity()) {
                setFieldError(input, null);
            } else {
                valid = false;
                setFieldError(input, fieldErrorMessage(input));
            }
        });
        if (!valid) {
            const firstInvalid = form.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
        }
        return valid;
    }

    async function handleLoginSubmit(event) {
        event.preventDefault();
        if (isLoginInFlight || lockoutRemaining > 0) return;
        clearMessages();

        let valid = true;
        if (usernameInput && !usernameInput.value.trim()) {
            setFieldError(usernameInput, 'وارد کردن نام کاربری یا شماره موبایل الزامی است.');
            valid = false;
        } else {
            setFieldError(usernameInput, null);
        }

        if (passwordInput && !passwordInput.value) {
            setFieldError(passwordInput, 'وارد کردن رمز عبور الزامی است.');
            valid = false;
        } else {
            setFieldError(passwordInput, null);
        }

        if (!valid) {
            const firstInvalid = formLogin.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        isLoginInFlight = true;
        setButtonLoading(loginSubmitBtn, true);

        const username = normalizeDigits(usernameInput.value.trim());
        const password = passwordInput.value;

        try {
            if (telegramTicket) {
                const res = await transport.telegramLink({
                    ticket: telegramTicket,
                    username,
                    password,
                });
                passwordInput.value = '';
                const result = res.data || res;
                if (result.requires_2fa) {
                    telegram2fa = { ticket: telegramTicket, challenge_id: result.challenge_id };
                    isLoginInFlight = false;
                    enterTwoFactorStep({
                        channel: 'sms',
                        two_fa_method: 'sms',
                        phone_mask: result.phone_mask ?? null,
                        destination_mask: result.phone_mask ?? null,
                        available_channels: ['sms'],
                        secondary_actions: {
                            resend_current: false,
                            send_via_email: false,
                            use_authenticator: false,
                        },
                    }, { cooldownSeconds: 0 });
                    return;
                }
                isLoginInFlight = false;
                finishTelegram(result);
                return;
            }

            const result = await transport.login(username, password);
            passwordInput.value = '';
            if (result && result.requires_2fa) {
                isLoginInFlight = false;
                enterTwoFactorStep(result);
                return;
            }
            isLoginInFlight = false;
            handleAuthSuccess(result);
        } catch (error) {
            isLoginInFlight = false;
            if (TELEGRAM_RESET_CODES.includes(error && error.code)) {
                resetTelegramFlow(TELEGRAM_RESET_TEXT);
            } else {
                const classified = classifyAuthError(error, 'login');
                showError(classified.message, {
                    tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
                });
                if (classified.kind === 'rate_limit' && classified.retryAfter) {
                    startLockoutCountdown(classified.retryAfter);
                }
            }
            setButtonLoading(loginSubmitBtn, false);
        }
    }

    async function handleRegisterSubmit(event) {
        event.preventDefault();
        if (isRegisterInFlight || lockoutRemaining > 0) return;
        clearMessages();

        if (!validateRegisterForm(formRegister)) return;

        isRegisterInFlight = true;
        setButtonLoading(registerSubmitBtn, true);

        try {
            const data = Object.fromEntries(new FormData(formRegister));
            const payload = { ...data, grade: Number(data.grade) };
            if (telegramTicket) {
                const res = await transport.telegramRegister({ ticket: telegramTicket, ...payload });
                isRegisterInFlight = false;
                finishTelegram(res.data || res);
                return;
            }
            const result = await transport.register(payload);
            isRegisterInFlight = false;
            handleAuthSuccess(result);
        } catch (error) {
            isRegisterInFlight = false;
            if (TELEGRAM_RESET_CODES.includes(error && error.code)) {
                resetTelegramFlow(TELEGRAM_RESET_TEXT);
            } else {
                const classified = classifyAuthError(error, 'server');
                const message =
                    classified.kind === 'rate_limit' || classified.kind === 'network' || classified.kind === 'server'
                        ? classified.message
                        : (error && error.message) || 'خطایی در ثبت‌نام رخ داد. لطفاً دوباره تلاش کنید.';
                showError(message, {
                    tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
                });
                if (classified.kind === 'rate_limit' && classified.retryAfter) {
                    startLockoutCountdown(classified.retryAfter);
                }
            }
            setButtonLoading(registerSubmitBtn, false);
        }
    }

    async function submitTwoFactorCode(options = {}) {
        if (isVerifyInFlight || isChannelOpInFlight || lockoutRemaining > 0) return;

        syncHiddenCode();
        const code = hiddenCodeInput ? hiddenCodeInput.value : '';

        if (recoveryMode) {
            if (code.length < 6) {
                setFieldError(recoveryInput, 'لطفاً کد بازیابی معتبر وارد کنید.');
                if (recoveryInput) recoveryInput.focus();
                return;
            }
            setFieldError(recoveryInput, null);
        } else {
            if (!/^\d{6}$/.test(code)) {
                setOtpGroupError('لطفاً هر ۶ رقم کد تأیید را وارد کنید.');
                const firstEmpty = otpInputs.find((el) => !el.value) || otpInputs[0];
                if (firstEmpty) firstEmpty.focus();
                return;
            }
            if (options.auto && lastAutoSubmittedCode === code) {
                return;
            }
            setOtpGroupError(null);
            lastAutoSubmittedCode = code;
        }

        clearMessages();
        isVerifyInFlight = true;
        setButtonLoading(verifySubmitBtn, true);
        if (switchEmailBtn) switchEmailBtn.disabled = true;
        if (switchTotpBtn) switchTotpBtn.disabled = true;
        if (resendBtn) resendBtn.disabled = true;
        if (toggleRecoveryBtn) toggleRecoveryBtn.disabled = true;

        try {
            if (telegram2fa) {
                const res = await transport.telegramVerify2fa({
                    ticket: telegram2fa.ticket,
                    challenge_id: telegram2fa.challenge_id,
                    code,
                });
                clearOtpInputs();
                isVerifyInFlight = false;
                finishTelegram(res.data || res);
                return;
            }

            const activeChannel =
                currentChallenge && (currentChallenge.channel || currentChallenge.two_fa_method);
            const verifyOptions = recoveryMode
                ? { method: 'recovery' }
                : activeChannel === 'totp'
                    ? { method: 'totp' }
                    : {};
            const result = await transport.verify2fa(code, verifyOptions);
            clearOtpInputs();
            clearRecoveryInput();
            isVerifyInFlight = false;
            handleAuthSuccess(result);
        } catch (error) {
            isVerifyInFlight = false;
            if (TELEGRAM_RESET_CODES.includes(error && error.code)) {
                resetTelegramFlow(TELEGRAM_RESET_TEXT);
                setButtonLoading(verifySubmitBtn, false);
                return;
            }
            const classified = classifyAuthError(error, 'verify');
            showError(classified.message, {
                tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
            });
            if (classified.kind === 'rate_limit' && classified.retryAfter) {
                startLockoutCountdown(classified.retryAfter);
            }
            setButtonLoading(verifySubmitBtn, false);
            if (!recoveryMode) {
                clearOtpInputs();
            } else {
                lastAutoSubmittedCode = null;
            }
            renderTwoFactorStep({ focus: classified.kind !== 'rate_limit' });
        }
    }

    function applyOtpDigits(startIndex, rawText) {
        const digits = extractOtpDigits(rawText, OTP_LENGTH);
        if (!digits) return;

        const origin = digits.length >= OTP_LENGTH ? 0 : startIndex;
        let lastIndex = origin;
        for (let i = 0; i < digits.length && origin + i < OTP_LENGTH; i += 1) {
            otpInputs[origin + i].value = digits[i];
            lastIndex = origin + i;
        }

        lastAutoSubmittedCode = null;
        setOtpGroupError(null);
        updateFilledStyles();
        syncHiddenCode();

        const fullCode = getOtpValue();
        if (fullCode.length === OTP_LENGTH) {
            otpInputs[OTP_LENGTH - 1].focus();
            submitTwoFactorCode({ auto: true });
            return;
        }

        const nextIndex = Math.min(lastIndex + 1, OTP_LENGTH - 1);
        otpInputs[nextIndex].focus();
    }

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (event) => {
            const raw = event.target.value;
            const digits = extractOtpDigits(raw, OTP_LENGTH);

            if (digits.length === 0) {
                input.value = '';
                lastAutoSubmittedCode = null;
                updateFilledStyles();
                syncHiddenCode();
                return;
            }

            if (digits.length > 1) {
                applyOtpDigits(index, digits);
                return;
            }

            input.value = digits[0];
            lastAutoSubmittedCode = null;
            setOtpGroupError(null);
            updateFilledStyles();
            syncHiddenCode();

            const fullCode = getOtpValue();
            if (fullCode.length === OTP_LENGTH) {
                submitTwoFactorCode({ auto: true });
            } else if (index < OTP_LENGTH - 1) {
                otpInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace') {
                if (input.value) {
                    input.value = '';
                    lastAutoSubmittedCode = null;
                    updateFilledStyles();
                    syncHiddenCode();
                    event.preventDefault();
                } else if (index > 0) {
                    otpInputs[index - 1].value = '';
                    lastAutoSubmittedCode = null;
                    updateFilledStyles();
                    syncHiddenCode();
                    otpInputs[index - 1].focus();
                    event.preventDefault();
                }
                return;
            }
            if (event.key === 'ArrowLeft' && index > 0) {
                event.preventDefault();
                otpInputs[index - 1].focus();
                return;
            }
            if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
                event.preventDefault();
                otpInputs[index + 1].focus();
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                otpInputs[0].focus();
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                otpInputs[OTP_LENGTH - 1].focus();
            }
        });

        input.addEventListener('paste', (event) => {
            const pasted = event.clipboardData ? event.clipboardData.getData('text') : '';
            const digits = extractOtpDigits(pasted, OTP_LENGTH);
            if (!digits) return;
            event.preventDefault();
            applyOtpDigits(index, digits);
        });

        input.addEventListener('focus', () => {
            input.select();
        });
    });

    if (recoveryInput) {
        recoveryInput.addEventListener('input', () => {
            const normalized = normalizeRecoveryCode(recoveryInput.value);
            if (recoveryInput.value !== normalized && /[\u06F0-\u06F9\u0660-\u0669]/.test(recoveryInput.value)) {
                recoveryInput.value = normalized;
            }
            setFieldError(recoveryInput, null);
            syncHiddenCode();
        });
    }

    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            if (isChannelOpInFlight || isVerifyInFlight || cooldownRemaining > 0 || telegram2fa) return;
            const ui = resolveChannelUiState(currentChallenge, { recoveryMode });
            if (!ui.showResend || ui.resendExhausted) return;

            clearMessages();
            isChannelOpInFlight = true;
            renderTwoFactorStep({ focus: false });

            try {
                const updated = await transport.resend2fa();
                currentChallenge = { ...currentChallenge, ...updated };
                isChannelOpInFlight = false;
                clearOtpInputs();
                renderTwoFactorStep({ focus: true });
                startResendCooldown(currentChallenge.resend_cooldown_seconds ?? 60);
                showSuccess('کد تأیید جدید ارسال شد.');
            } catch (error) {
                isChannelOpInFlight = false;
                const classified = classifyAuthError(error, 'resend');
                showError(classified.message, {
                    tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
                });
                if (classified.kind === 'rate_limit' && classified.retryAfter) {
                    startResendCooldown(classified.retryAfter);
                }
                renderTwoFactorStep({ focus: false });
            }
        });
    }

    async function handleChannelSwitch(targetChannel) {
        if (isChannelOpInFlight || isVerifyInFlight || telegram2fa) return;
        clearMessages();
        isChannelOpInFlight = true;
        renderTwoFactorStep({ focus: false });

        try {
            const updated = await transport.switch2faChannel(targetChannel);
            currentChallenge = {
                ...currentChallenge,
                ...updated,
                channel: updated.channel || updated.two_fa_method || targetChannel,
                two_fa_method: updated.two_fa_method || updated.channel || targetChannel,
            };
            recoveryMode = false;
            isChannelOpInFlight = false;
            clearOtpInputs();
            renderTwoFactorStep({ focus: true });
            if (targetChannel === 'totp') {
                startResendCooldown(0);
            } else {
                startResendCooldown(currentChallenge.resend_cooldown_seconds ?? 60);
            }
        } catch (error) {
            isChannelOpInFlight = false;
            const classified = classifyAuthError(error, 'switch');
            showError(classified.message, {
                tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
            });
            renderTwoFactorStep({ focus: false });
        }
    }

    if (switchEmailBtn) {
        switchEmailBtn.addEventListener('click', () => handleChannelSwitch('email'));
    }
    if (switchTotpBtn) {
        switchTotpBtn.addEventListener('click', () => handleChannelSwitch('totp'));
    }

    if (toggleRecoveryBtn) {
        toggleRecoveryBtn.addEventListener('click', () => {
            if (isVerifyInFlight || isChannelOpInFlight || telegram2fa) return;
            clearMessages();
            recoveryMode = !recoveryMode;
            clearOtpInputs();
            clearRecoveryInput();
            renderTwoFactorStep({ focus: true });
        });
    }

    if (cancelTwoFactorBtn) {
        cancelTwoFactorBtn.addEventListener('click', () => {
            transport.cancel2fa();
            telegram2fa = null;
            setMode('login');
            if (usernameInput) {
                window.requestAnimationFrame(() => usernameInput.focus());
            }
        });
    }

    if (loginTab) {
        loginTab.addEventListener('click', () => setMode('login'));
    }
    if (registerTab) {
        registerTab.addEventListener('click', () => setMode('register'));
    }

    if (formLogin) {
        formLogin.addEventListener('submit', handleLoginSubmit);
    }
    if (formRegister) {
        formRegister.addEventListener('submit', handleRegisterSubmit);
    }
    if (formTwoFactor) {
        formTwoFactor.addEventListener('submit', (event) => {
            event.preventDefault();
            submitTwoFactorCode({ auto: false });
        });
    }

    // Telegram widget bindings
    window.addEventListener('famo:telegram-auth', async (event) => {
        const detail = event.detail;
        if (!detail || !detail.id) return;
        clearMessages();
        if (telegramChooser) telegramChooser.classList.add('hidden');
        if (telegramLinked) telegramLinked.classList.add('hidden');
        telegram2fa = null;
        telegramTicket = null;
        try {
            const res = await transport.telegramVerify(detail);
            const data = res.data || res;
            if (data.linked) {
                showTelegramLinked(data);
                return;
            }
            telegramTicket = data.ticket;
            if (TELEGRAM_SOURCE) {
                setTelegramGate(false);
                setMode('login');
            }
            showTelegramChooser(data.telegram);
        } catch (error) {
            if (TELEGRAM_RESET_CODES.includes(error && error.code)) {
                resetTelegramFlow(TELEGRAM_RESET_TEXT);
            } else {
                telegramTicket = null;
                const classified = classifyAuthError(error, 'server');
                showError(classified.message);
            }
        }
    });

    const telegramLoginChoice = $('#telegramLoginChoice');
    if (telegramLoginChoice) {
        telegramLoginChoice.addEventListener('click', () => {
            if (telegramChooser) telegramChooser.classList.add('hidden');
            setMode('login');
            showSuccess('برای اتصال، اطلاعات حساب موجود خود را وارد کنید.');
        });
    }

    const telegramRegisterChoice = $('#telegramRegisterChoice');
    if (telegramRegisterChoice) {
        telegramRegisterChoice.addEventListener('click', () => {
            if (telegramChooser) telegramChooser.classList.add('hidden');
            setMode('register');
            showSuccess('برای اتصال، فرم ثبت‌نام را تکمیل کنید.');
        });
    }

    window.setTimeout(() => {
        if (!telegramLogin || telegramLogin.classList.contains('hidden')) return;
        if (telegramLogin.querySelector('iframe')) return;
        if (telegramHintBox) {
            telegramHintBox.textContent = TELEGRAM_HINT_TEXT;
            telegramHintBox.classList.remove('hidden');
        }
    }, 5000);

    document.querySelectorAll('#formLogin input, #formRegister input, #formRegister select').forEach((input) => {
        const clearWhenValid = () => {
            const group = input.closest('.input-group');
            if (!group || !group.classList.contains('error')) return;
            if (input.closest('#formLogin')) {
                if (input.value.trim()) setFieldError(input, null);
            } else if (input.checkValidity()) {
                setFieldError(input, null);
            }
        };
        input.addEventListener('input', clearWhenValid);
        input.addEventListener('change', clearWhenValid);
    });

    document.querySelectorAll('.password-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.passwordTarget;
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;
            const icon = button.querySelector('img');
            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            button.setAttribute('aria-pressed', reveal ? 'true' : 'false');
            button.setAttribute('aria-label', reveal ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور');
            if (icon) {
                icon.src = reveal ? resolveAsset('svg/eye-open.svg') : resolveAsset('svg/eye-closed.svg');
            }
        });
    });

    const registerGrade = $('#registerGrade');
    const fieldGroup = $('#fieldGroup');
    const registerField = $('#registerField');
    if (registerGrade && fieldGroup && registerField) {
        registerGrade.addEventListener('change', (event) => {
            const isMiddleSchool = Number(event.target.value) <= 9;
            fieldGroup.classList.toggle('hidden', isMiddleSchool);
            registerField.required = !isMiddleSchool;
            if (isMiddleSchool) registerField.value = 'راهنمایی';
        });
    }

    if (previewModeActive) {
        window.__FAMO_AUTH_PREVIEW__ = {
            setTransport(customTransport) {
                transport = { ...transport, ...customTransport };
            },
            setMode,
            enterTwoFactorStep,
            showError,
            showSuccess,
            clearMessages,
            startLockoutCountdown,
            setLoginLoading(loading) {
                isLoginInFlight = loading;
                setButtonLoading(loginSubmitBtn, loading);
            },
            handleAuthSuccess,
        };
    } else {
        if (TELEGRAM_SOURCE && telegramLogin) setTelegramGate(true);
        if (!TELEGRAM_SOURCE) {
            transport.getMe().then((user) => {
                if (user) {
                    transport.redirect(destination(user));
                }
            });
        }
    }
}

onReady(initUnifiedAuth);
