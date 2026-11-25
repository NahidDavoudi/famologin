import { onReady } from './api.js';

/**
 * Interactive preview harness loaded ONLY on /admin/login/preview or /admin/login?preview=1.
 * Allows visually inspecting and interactively testing all 9 admin login states,
 * error variants, and RTL/LTR direction without live admin credentials.
 */
function initPreviewHarness() {
    const toolbar = document.getElementById('adminPreviewToolbar');
    const ctrl = window.__FAMO_ADMIN_LOGIN_PREVIEW__;
    if (!toolbar || !ctrl) return;

    let simulatedChallenge = {
        requires_2fa: true,
        user_id: 1,
        username: 'admin',
        role: 'admin',
        channel: 'sms',
        two_fa_method: 'sms',
        destination_mask: '0912***89',
        phone_mask: '0912***89',
        email_mask: 'a***@famoacademy.ir',
        challenge_token: 'preview-session-challenge',
        expires_in: 300,
        resend_cooldown_seconds: 60,
        sends_used: 1,
        max_sends: 3,
        sends_remaining: 2,
        available_channels: ['sms', 'email', 'totp'],
        secondary_actions: {
            resend_current: true,
            send_via_email: true,
            use_authenticator: true,
        },
    };

    ctrl.setTransport({
        async login(username, password) {
            await new Promise((r) => window.setTimeout(r, 250));
            if (username === 'invalid' || password === 'wrong') {
                const err = new Error('Invalid credentials');
                err.code = 'AUTH_ERROR';
                err.status = 401;
                throw err;
            }
            return { ...simulatedChallenge };
        },
        async verify2fa(code) {
            await new Promise((r) => window.setTimeout(r, 200));
            if (code === '000000') {
                const err = new Error('Invalid code');
                err.code = '2FA_ERROR';
                err.status = 401;
                throw err;
            }
            if (code === '999999') {
                const err = new Error('Code expired');
                err.code = 'CODE_EXPIRED';
                err.status = 401;
                throw err;
            }
            return {
                user: { id: 1, username: 'admin', role: 'admin' },
                auth_method: simulatedChallenge.channel,
                remaining_recovery_codes: null,
            };
        },
        async resend2fa() {
            await new Promise((r) => window.setTimeout(r, 200));
            const nextRemaining = Math.max(0, (simulatedChallenge.sends_remaining ?? 2) - 1);
            simulatedChallenge = {
                ...simulatedChallenge,
                sends_used: (simulatedChallenge.sends_used ?? 1) + 1,
                sends_remaining: nextRemaining,
                resend_cooldown_seconds: 60,
            };
            return { ...simulatedChallenge };
        },
        async switch2faChannel(channel) {
            await new Promise((r) => window.setTimeout(r, 200));
            if (channel === 'email') {
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'email',
                    two_fa_method: 'email',
                    destination_mask: 'a***@famoacademy.ir',
                    sends_remaining: Math.max(0, (simulatedChallenge.sends_remaining ?? 2) - 1),
                    resend_cooldown_seconds: 60,
                    secondary_actions: {
                        resend_current: true,
                        send_via_email: false,
                        use_authenticator: true,
                    },
                };
            } else if (channel === 'totp') {
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'totp',
                    two_fa_method: 'totp',
                    destination_mask: null,
                    secondary_actions: {
                        resend_current: false,
                        send_via_email: false,
                        use_authenticator: false,
                    },
                };
            }
            return { ...simulatedChallenge };
        },
        async getMe() {
            return null;
        },
        cancel2fa() {},
        redirect() {
            // Stay in preview mode so reviewers can inspect State 9 confirmation.
        },
    });

    const buttons = Array.from(toolbar.querySelectorAll('[data-preview-state]'));
    const dirToggle = document.getElementById('previewDirToggle');

    function setActiveButton(stateName) {
        buttons.forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.previewState === stateName);
        });
    }

    function applyState(stateName) {
        setActiveButton(stateName);
        switch (stateName) {
            case 'credentials':
                ctrl.enterCredentialsStep();
                break;
            case 'credentials-loading':
                ctrl.enterCredentialsStep({ focus: false });
                ctrl.setLoginLoading(true);
                break;
            case 'credentials-error':
                ctrl.enterCredentialsStep({ focus: false });
                ctrl.showError('اطلاعات ورود نامعتبر است. نام کاربری و رمز عبور خود را بررسی کنید.');
                break;
            case 'sms':
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'sms',
                    two_fa_method: 'sms',
                    destination_mask: '0912***89',
                    sends_used: 1,
                    max_sends: 3,
                    sends_remaining: 2,
                    resend_cooldown_seconds: 60,
                    secondary_actions: {
                        resend_current: true,
                        send_via_email: true,
                        use_authenticator: true,
                    },
                };
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 60 });
                break;
            case 'sms-ready':
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'sms',
                    two_fa_method: 'sms',
                    destination_mask: '0912***89',
                    sends_used: 1,
                    max_sends: 3,
                    sends_remaining: 2,
                    resend_cooldown_seconds: 60,
                    secondary_actions: {
                        resend_current: true,
                        send_via_email: true,
                        use_authenticator: true,
                    },
                };
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0 });
                break;
            case 'sms-exhausted':
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'sms',
                    two_fa_method: 'sms',
                    destination_mask: '0912***89',
                    sends_used: 3,
                    max_sends: 3,
                    sends_remaining: 0,
                    secondary_actions: {
                        resend_current: true,
                        send_via_email: true,
                        use_authenticator: true,
                    },
                };
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0 });
                break;
            case 'email':
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'email',
                    two_fa_method: 'email',
                    destination_mask: 'a***@famoacademy.ir',
                    sends_used: 2,
                    max_sends: 3,
                    sends_remaining: 1,
                    resend_cooldown_seconds: 60,
                    secondary_actions: {
                        resend_current: true,
                        send_via_email: false,
                        use_authenticator: true,
                    },
                };
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 60 });
                break;
            case 'totp':
                simulatedChallenge = {
                    ...simulatedChallenge,
                    channel: 'totp',
                    two_fa_method: 'totp',
                    destination_mask: null,
                    secondary_actions: {
                        resend_current: false,
                        send_via_email: false,
                        use_authenticator: false,
                    },
                };
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0 });
                break;
            case 'recovery':
                ctrl.enterTwoFactorStep(simulatedChallenge, { recoveryMode: true, cooldownSeconds: 0 });
                break;
            case 'err-invalid':
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0, focus: false });
                ctrl.showError('کد واردشده معتبر نیست یا منقضی شده است. لطفاً دوباره بررسی کنید.');
                break;
            case 'err-expired':
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0, focus: false });
                ctrl.showError('کد تأیید یا نشست ورود منقضی شده است. کد جدیدی درخواست کنید یا دوباره وارد شوید.');
                break;
            case 'err-ratelimit':
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0, focus: false });
                ctrl.showError('تعداد تلاش‌ها بیش از حد مجاز است. لطفاً پس از ۴۵ ثانیه دوباره تلاش کنید.', { tone: 'warning' });
                ctrl.startLockoutCountdown(45);
                break;
            case 'err-network':
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0, focus: false });
                ctrl.showError('اتصال به سرور برقرار نشد. اینترنت خود را بررسی کرده و دوباره تلاش کنید.');
                break;
            case 'err-server':
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0, focus: false });
                ctrl.showError('سرویس احراز هویت موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کنید.');
                break;
            case 'success':
                ctrl.enterTwoFactorStep(simulatedChallenge, { cooldownSeconds: 0, focus: false });
                ctrl.handleAuthSuccess({
                    user: { id: 1, username: 'admin', role: 'admin' },
                    remaining_recovery_codes: null,
                });
                break;
            default:
                break;
        }
    }

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => applyState(btn.dataset.previewState));
    });

    if (dirToggle) {
        dirToggle.addEventListener('click', () => {
            const html = document.documentElement;
            const nextDir = html.getAttribute('dir') === 'rtl' ? 'ltr' : 'rtl';
            html.setAttribute('dir', nextDir);
            dirToggle.textContent = nextDir === 'rtl' ? 'تغییر جهت به LTR' : 'تغییر جهت به RTL';
        });
    }

    const initial = new URLSearchParams(window.location.search).get('state');
    if (initial) {
        applyState(initial);
    } else {
        setActiveButton('credentials');
    }
}

onReady(initPreviewHarness);
