import API, { onReady } from './api.js';
import {
    classifyAuthError,
    describeChannelPrompt,
    extractOtpDigits,
    formatWaitDuration,
    normalizeRecoveryCode,
    resolveChannelUiState,
    toPersianDigits,
} from './admin-2fa-helpers.js';

const OTP_LENGTH = 6;

function resolveAsset(path) {
    if (typeof window.FAMO_ASSET === 'function') {
        return window.FAMO_ASSET(path);
    }
    const base = (window.APP_CONFIG && window.APP_CONFIG.assetUrl) || '';
    return String(base).replace(/\/$/, '') + '/' + String(path).replace(/^\//, '');
}

function resolveDestination(user) {
    const isStudent = user && user.role === 'student';
    const roleHome = isStudent
        ? window.APP_CONFIG?.dashboardUrl
        : window.APP_CONFIG?.adminUrl;

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
            // Fall back to configured panel home.
        }
    }

    return roleHome || '/admin/';
}

function initAdminLogin() {
    const root = document.getElementById('adminLoginApp');
    if (!root) return;

    const $ = (sel) => document.querySelector(sel);

    const cardTitle = $('#adminCardTitle');
    const cardSubtitle = $('#adminCardSubtitle');
    const loginContainer = $('#loginFormContainer');
    const twoFactorContainer = $('#twoFactorContainer');
    const formLogin = $('#formLogin');
    const formTwoFactor = $('#formTwoFactor');
    const usernameInput = $('#loginUsername');
    const passwordInput = $('#loginPassword');
    const loginSubmitBtn = formLogin ? formLogin.querySelector('button[type="submit"]') : null;
    const verifySubmitBtn = formTwoFactor ? formTwoFactor.querySelector('button[type="submit"]') : null;

    const errorBox = $('#formErrorSummary');
    const errorBoxText = $('#formErrorText');
    const successBox = $('#formSuccessSummary');
    const successBoxText = $('#formSuccessText');

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

    let currentStep = 'login';
    let currentChallenge = null;
    let recoveryMode = false;
    let isLoginInFlight = false;
    let isVerifyInFlight = false;
    let isChannelOpInFlight = false;
    let lastAutoSubmittedCode = null;
    let cooldownRemaining = 0;
    let cooldownTimerId = null;
    let lockoutRemaining = 0;
    let lockoutTimerId = null;
    let redirectTimerId = null;

    let previewModeActive = root.dataset.preview === '1';
    let transport = {
        login: (username, password) => API.login(username, password),
        verify2fa: (code, options) => API.verify2fa(code, options),
        resend2fa: () => API.resend2fa(),
        switch2faChannel: (channel) => API.switch2faChannel(channel),
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
            errorBox.classList.remove('admin-alert-warning');
            errorBox.classList.add('admin-alert-error');
        }
        if (errorBoxText) errorBoxText.textContent = '';
        if (successBox) successBox.classList.add('hidden');
        if (successBoxText) successBoxText.textContent = '';
    }

    function showError(message, options = {}) {
        if (!errorBox || !errorBoxText) return;
        const isWarning = options.tone === 'warning';
        errorBox.classList.toggle('admin-alert-warning', isWarning);
        errorBox.classList.toggle('admin-alert-error', !isWarning);
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
        if (currentStep !== '2fa') return;
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
        const ui = resolveChannelUiState(currentChallenge, { recoveryMode });
        const prompt = describeChannelPrompt(currentChallenge);

        if (cardTitle) {
            cardTitle.textContent = recoveryMode ? 'ورود با کد بازیابی' : prompt.title;
        }
        if (cardSubtitle) {
            cardSubtitle.textContent = recoveryMode
                ? 'یکی از کدهای بازیابی یک‌بارمصرف حساب خود را وارد کنید.'
                : 'مرحله دوم احراز هویت پنل مدیریت فامو';
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

        if (switchEmailBtn) {
            switchEmailBtn.classList.toggle('hidden', !ui.showSendViaEmail);
            switchEmailBtn.disabled = isChannelOpInFlight || isVerifyInFlight;
        }
        if (switchTotpBtn) {
            switchTotpBtn.classList.toggle('hidden', !ui.showUseAuthenticator);
            switchTotpBtn.disabled = isChannelOpInFlight || isVerifyInFlight;
        }

        const hasSecondary = ui.showSendViaEmail || ui.showUseAuthenticator;
        if (secondaryActionsWrap) secondaryActionsWrap.classList.toggle('hidden', !hasSecondary);
        if (secondaryDivider) secondaryDivider.classList.toggle('hidden', !hasSecondary);

        if (toggleRecoveryBtn) {
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

    function enterCredentialsStep(options = {}) {
        currentStep = 'login';
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
        setButtonLoading(verifySubmitBtn, false);

        if (loginContainer) loginContainer.classList.remove('hidden');
        if (twoFactorContainer) twoFactorContainer.classList.add('hidden');

        if (cardTitle) cardTitle.textContent = 'ورود به پنل مدیریت';
        if (cardSubtitle) {
            cardSubtitle.textContent = 'برای ورود به پنل مدیریت آموزشگاه فامو، مشخصات حساب خود را وارد کنید.';
        }

        if (options.clearMessages !== false) {
            clearMessages();
        }
        if (options.focus !== false && usernameInput) {
            window.requestAnimationFrame(() => usernameInput.focus());
        }
    }

    function enterTwoFactorStep(challenge, options = {}) {
        currentStep = '2fa';
        currentChallenge = { ...challenge };
        recoveryMode = Boolean(options.recoveryMode);
        isVerifyInFlight = false;
        isChannelOpInFlight = false;
        clearOtpInputs();
        clearRecoveryInput();
        setButtonLoading(loginSubmitBtn, false);
        setButtonLoading(verifySubmitBtn, false);

        if (loginContainer) loginContainer.classList.add('hidden');
        if (twoFactorContainer) twoFactorContainer.classList.remove('hidden');

        if (options.clearMessages !== false) {
            clearMessages();
        }

        renderTwoFactorStep({ focus: options.focus !== false });

        const cooldownSeconds =
            options.cooldownSeconds !== undefined
                ? options.cooldownSeconds
                : (challenge.resend_cooldown_seconds ?? 60);
        startResendCooldown(cooldownSeconds);
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
        showSuccess(`ورود با موفقیت انجام شد. در حال انتقال به پنل مدیریت…${suffix}`);

        if (loginSubmitBtn) loginSubmitBtn.disabled = true;
        if (verifySubmitBtn) verifySubmitBtn.disabled = true;

        const targetUrl = resolveDestination(result.user);
        redirectTimerId = window.setTimeout(() => {
            transport.redirect(targetUrl);
        }, 450);
    }

    async function handleLoginSubmit(event) {
        event.preventDefault();
        if (isLoginInFlight || lockoutRemaining > 0) return;
        clearMessages();

        let valid = true;
        if (usernameInput && !usernameInput.value.trim()) {
            setFieldError(usernameInput, 'وارد کردن نام کاربری الزامی است.');
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

        try {
            const result = await transport.login(usernameInput.value.trim(), passwordInput.value);
            passwordInput.value = '';
            if (result && result.requires_2fa) {
                isLoginInFlight = false;
                enterTwoFactorStep(result);
                return;
            }
            handleAuthSuccess(result);
        } catch (error) {
            const classified = classifyAuthError(error, 'login');
            showError(classified.message, {
                tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
            });
            if (classified.kind === 'rate_limit' && classified.retryAfter) {
                startLockoutCountdown(classified.retryAfter);
            }
            isLoginInFlight = false;
            setButtonLoading(loginSubmitBtn, false);
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
            handleAuthSuccess(result);
        } catch (error) {
            const classified = classifyAuthError(error, 'verify');
            showError(classified.message, {
                tone: classified.kind === 'rate_limit' ? 'warning' : 'error',
            });
            if (classified.kind === 'rate_limit' && classified.retryAfter) {
                startLockoutCountdown(classified.retryAfter);
            }
            isVerifyInFlight = false;
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

        // If user pasted a full 6-digit code into any slot, fill from slot 0.
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
            if (isChannelOpInFlight || isVerifyInFlight || cooldownRemaining > 0) return;
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
        if (isChannelOpInFlight || isVerifyInFlight) return;
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
            if (isVerifyInFlight || isChannelOpInFlight) return;
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
            enterCredentialsStep();
        });
    }

    if (formLogin) {
        formLogin.addEventListener('submit', handleLoginSubmit);
    }

    if (formTwoFactor) {
        formTwoFactor.addEventListener('submit', (event) => {
            event.preventDefault();
            submitTwoFactorCode({ auto: false });
        });
    }

    [usernameInput, passwordInput].forEach((input) => {
        if (!input) return;
        input.addEventListener('input', () => {
            if (input.value.trim()) setFieldError(input, null);
        });
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

    // Expose controlled controller hook strictly for the external interactive preview harness.
    if (previewModeActive) {
        window.__FAMO_ADMIN_LOGIN_PREVIEW__ = {
            setTransport(customTransport) {
                transport = { ...transport, ...customTransport };
            },
            enterCredentialsStep,
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
            setPreviewMode(flag) {
                previewModeActive = Boolean(flag);
            },
        };
    } else {
        transport.getMe().then((user) => {
            if (user) {
                transport.redirect(resolveDestination(user));
            }
        });
    }
}

onReady(initAdminLogin);
