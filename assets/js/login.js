const { default: API } = await import('./api.js');

const asset = (path) => {
    const base = window.APP_CONFIG && window.APP_CONFIG.assetUrl;
    return String(base).replace(/\/$/, '') + '/' + String(path).replace(/^\//, '');
};

const $ = (selector) => document.querySelector(selector);
const loginBox = $('#loginFormContainer');
const registerBox = $('#registerFormContainer');
const twoFactorBox = $('#twoFactorContainer');
const errorBox = $('#formErrorSummary');
const successBox = $('#formSuccessSummary');
const telegramLogin = $('#telegramLogin');
const telegramHintBox = $('#telegramHint');
const telegramChooser = $('#telegramChooser');
const telegramLinked = $('#telegramLinked');
const authTabs = $('#authTabs');
const telegramInstruction = $('#telegramInstruction');

const TELEGRAM_HINT_TEXT = 'اگر ویجت باز نشد، اتصال به تلگرام/فیلترشکن را بررسی و دوباره تلاش کنید.';
const RATE_LIMIT_TEXT = 'تعداد تلاش‌ها بیش از حد مجاز است. کمی صبر کنید و دوباره تلاش کنید.';
const TELEGRAM_SOURCE = new URLSearchParams(window.location.search).get('source') === 'telegram';
const TELEGRAM_RESET_CODES = ['TELEGRAM_TICKET_INVALID', 'TELEGRAM_AUTH_INVALID', 'TELEGRAM_REPLAY'];
const TELEGRAM_RESET_TEXT = 'نشست تلگرام منقضی شد. لطفاً دوباره با تلگرام تأیید کنید.';

let telegramTicket = null;
let telegram2fa = null;

function showError(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); successBox.classList.add('hidden'); errorBox.focus(); }
function clearMessages() { errorBox.classList.add('hidden'); successBox.classList.add('hidden'); }
function showSuccess(message) { successBox.textContent = message; successBox.classList.remove('hidden'); errorBox.classList.add('hidden'); }
function friendlyError(error) {
    if (error && (error.code === 'RATE_LIMITED' || error.status === 429)) return RATE_LIMIT_TEXT;
    return (error && error.message) || 'خطایی رخ داد. دوباره تلاش کنید.';
}
function setTelegramGate(locked) {
    if (locked) {
        authTabs.classList.add('hidden');
        loginBox.classList.add('hidden');
        registerBox.classList.add('hidden');
        twoFactorBox.classList.add('hidden');
        if (telegramInstruction) telegramInstruction.classList.remove('hidden');
    } else {
        authTabs.classList.remove('hidden');
        if (telegramInstruction) telegramInstruction.classList.add('hidden');
    }
}
function resetTelegramFlow(message) {
    telegramTicket = null;
    telegram2fa = null;
    telegramChooser.classList.add('hidden');
    telegramLinked.classList.add('hidden');
    telegramHintBox.classList.add('hidden');
    if (telegramLogin) telegramLogin.classList.remove('hidden');
    if (TELEGRAM_SOURCE) setTelegramGate(true); else setMode('login');
    if (message) showError(message);
}
function finishTelegram(data) {
    telegramTicket = null;
    telegram2fa = null;
    if (data.bot_redirect_url) { window.location.assign(data.bot_redirect_url); return; }
    showSuccess('اتصال با موفقیت انجام شد. در حال انتقال...');
    window.setTimeout(() => go(data.user), 250);
}
function showTelegramChooser(telegram) {
    const name = telegram && (telegram.first_name || telegram.username);
    $('#telegramChooserMessage').textContent = name
        ? `حساب تلگرام «${name}» تأیید شد. برای اتصال، یکی از گزینه‌ها را انتخاب کنید.`
        : 'حساب تلگرام تأیید شد. برای اتصال، یکی از گزینه‌ها را انتخاب کنید.';
    telegramLinked.classList.add('hidden');
    telegramChooser.classList.remove('hidden');
}
function showTelegramLinked(data) {
    telegramLogin.classList.add('hidden');
    telegramHintBox.classList.add('hidden');
    telegramChooser.classList.add('hidden');
    telegramLinked.classList.remove('hidden');
    const message = $('#telegramLinkedMessage');
    const button = $('#telegramLinkedButton');
    if (data.bot_redirect_url) {
        message.textContent = 'این حساب تلگرام قبلاً به فامو متصل شده است. برای بازگشت به تلگرام روی دکمه زیر بزنید.';
        button.classList.remove('hidden');
        button.onclick = () => window.location.assign(data.bot_redirect_url);
    } else {
        message.textContent = 'این حساب تلگرام قبلاً به فامو متصل شده است. برای بازگشت، از ربات تلگرام استفاده کنید.';
        button.classList.add('hidden');
        button.onclick = null;
    }
}
function setMode(mode) {
    loginBox.classList.toggle('hidden', mode !== 'login');
    registerBox.classList.toggle('hidden', mode !== 'register');
    twoFactorBox.classList.toggle('hidden', mode !== '2fa');
    document.querySelectorAll('#formLogin input, #formLogin select, #formRegister input, #formRegister select, #formTwoFactor input, #formTwoFactor select').forEach((input) => setFieldError(input, null));
    clearMessages();
}
function destination(user) {
    const isStudent = user.role === 'student';
    const roleHome = isStudent
        ? window.APP_CONFIG?.dashboardUrl
        : window.APP_CONFIG?.adminUrl;
    const returnUrl = window.FAMO_LOGIN_RETURN_URL;

    // A return URL comes from the page that requested authentication. It must
    // not override role routing, otherwise a student can be sent back to the
    // admin guard and bounce between admin and login forever.
    if (returnUrl) {
        try {
            const parsed = new URL(returnUrl, window.location.origin);
            const segments = parsed.pathname.split('/').filter(Boolean);
            const allowedPanel = isStudent ? 'dashboard' : 'admin';
            const panelIndex = segments.lastIndexOf(allowedPanel);
            if (parsed.origin === window.location.origin && panelIndex !== -1) {
                const panelPath = segments.slice(panelIndex + 1).join('/');
                const suffix = [panelPath, parsed.search, parsed.hash].filter(Boolean).join('');
                return `${roleHome}/${suffix}`;
            }
        } catch (error) {
            // Invalid return URLs fall back to the role's configured panel home.
        }
    }

    return roleHome;
}
function go(user) { window.location.assign(destination(user)); }

function setButtonLoading(button, loading) {
    if (!button) return;
    button.classList.toggle('is-loading', loading);
    button.disabled = loading;
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
}

function fieldErrorMessage(input) {
    if (input.validity.valueMissing) return 'این فیلد الزامی است';
    if (input.validity.tooShort) return `حداقل ${input.minLength} کاراکتر وارد کنید`;
    if (input.validity.patternMismatch || input.validity.typeMismatch) return 'قالب وارد شده صحیح نیست';
    return 'مقدار وارد شده صحیح نیست';
}

function setFieldError(input, message) {
    const group = input.closest('.input-group');
    const messageEl = group && group.querySelector('.error-message');
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
        input.removeAttribute('aria-describedby');
    }
}

function validate(form) {
    let valid = true;
    form.querySelectorAll('input, select').forEach((input) => {
        if (input.checkValidity()) {
            setFieldError(input, null);
        } else {
            valid = false;
            setFieldError(input, fieldErrorMessage(input));
        }
    });
    return valid;
}

async function submit(form, action) {
    if (!validate(form)) return;
    const button = form.querySelector('button[type="submit"]');
    setButtonLoading(button, true);
    try {
        const data = Object.fromEntries(new FormData(form));
        if (telegramTicket && action === 'login') {
            const res = await API.telegramLink({ ticket: telegramTicket, username: data.username, password: data.password });
            const result = res.data || res;
            if (result.requires_2fa) {
                telegram2fa = { ticket: telegramTicket, challenge_id: result.challenge_id };
                $('#twoFactorHint').textContent = `کد تأیید به ${result.phone_mask} ارسال شد.`;
                setButtonLoading(button, false);
                setMode('2fa');
                return;
            }
            finishTelegram(result);
            return;
        }
        if (telegramTicket && action === 'register') {
            const res = await API.telegramRegister({ ticket: telegramTicket, ...data, grade: Number(data.grade) });
            finishTelegram(res.data || res);
            return;
        }
        const result = action === 'login' ? await API.login(data.username, data.password) : await API.register({ ...data, grade: Number(data.grade) });
        if (result.requires_2fa) { $('#twoFactorHint').textContent = `کد تأیید به ${result.email_mask} ارسال شد.`; setButtonLoading(button, false); setMode('2fa'); return; }
        showSuccess('ورود موفق بود. در حال انتقال...');
        window.setTimeout(() => go(result.user), 250);
    } catch (error) {
        if (TELEGRAM_RESET_CODES.includes(error && error.code)) {
            resetTelegramFlow(TELEGRAM_RESET_TEXT);
        } else {
            showError(friendlyError(error));
        }
        setButtonLoading(button, false);
    }
}

$('#loginTab').addEventListener('click', () => { setMode('login'); $('#loginTab').classList.add('active'); $('#registerTab').classList.remove('active'); });
$('#registerTab').addEventListener('click', () => { setMode('register'); $('#registerTab').classList.add('active'); $('#loginTab').classList.remove('active'); });
$('#formLogin').addEventListener('submit', (event) => { event.preventDefault(); submit(event.currentTarget, 'login'); });
$('#formRegister').addEventListener('submit', (event) => { event.preventDefault(); submit(event.currentTarget, 'register'); });
$('#formTwoFactor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!validate(form)) return;
    const button = form.querySelector('button[type="submit"]');
    setButtonLoading(button, true);
    try {
        const code = $('#twoFactorCode').value;
        if (telegram2fa) {
            const res = await API.telegramVerify2fa({ ticket: telegram2fa.ticket, challenge_id: telegram2fa.challenge_id, code });
            finishTelegram(res.data || res);
            return;
        }
        const result = await API.verify2fa(code);
        showSuccess('ورود موفق بود. در حال انتقال...');
        window.setTimeout(() => go(result.user), 250);
    } catch (error) {
        if (TELEGRAM_RESET_CODES.includes(error && error.code)) {
            resetTelegramFlow(TELEGRAM_RESET_TEXT);
        } else {
            showError(error.code === '2FA_ERROR' ? 'کد تأیید نامعتبر است.' : friendlyError(error));
        }
        setButtonLoading(button, false);
    }
});
$('#cancelTwoFactor').addEventListener('click', () => { API.cancel2fa(); telegram2fa = null; setMode('login'); });

window.addEventListener('famo:telegram-auth', async (event) => {
    const detail = event.detail;
    if (!detail || !detail.id) return;
    clearMessages();
    telegramChooser.classList.add('hidden');
    telegramLinked.classList.add('hidden');
    telegram2fa = null;
    telegramTicket = null;
    try {
        const res = await API.telegramVerify(detail);
        const data = res.data || res;
        if (data.linked) { showTelegramLinked(data); return; }
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
            showError(friendlyError(error));
        }
    }
});
$('#telegramLoginChoice').addEventListener('click', () => {
    telegramChooser.classList.add('hidden');
    setMode('login');
    showSuccess('برای اتصال، اطلاعات حساب موجود خود را وارد کنید.');
});
$('#telegramRegisterChoice').addEventListener('click', () => {
    telegramChooser.classList.add('hidden');
    setMode('register');
    showSuccess('برای اتصال، فرم ثبت‌نام را تکمیل کنید.');
});

window.setTimeout(() => {
    if (!telegramLogin || telegramLogin.classList.contains('hidden')) return;
    if (telegramLogin.querySelector('iframe')) return;
    telegramHintBox.textContent = TELEGRAM_HINT_TEXT;
    telegramHintBox.classList.remove('hidden');
}, 5000);

document.querySelectorAll('.input-group input, .input-group select').forEach((input) => {
    const clearWhenValid = () => {
        const group = input.closest('.input-group');
        if (group && group.classList.contains('error') && input.checkValidity()) setFieldError(input, null);
    };
    input.addEventListener('input', clearWhenValid);
    input.addEventListener('change', clearWhenValid);
});
document.querySelectorAll('.password-toggle').forEach((button) => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.passwordTarget); const icon = button.querySelector('img'); const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; icon.src = visible ? asset('svg/eye-open.svg') : asset('svg/eye-closed.svg'); button.setAttribute('aria-label', visible ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'); }));
$('#registerGrade').addEventListener('change', (event) => { const isMiddleSchool = Number(event.target.value) <= 9; $('#fieldGroup').classList.toggle('hidden', isMiddleSchool); $('#registerField').required = !isMiddleSchool; if (isMiddleSchool) $('#registerField').value = 'راهنمایی'; });

if (TELEGRAM_SOURCE && telegramLogin) setTelegramGate(true);
if (!TELEGRAM_SOURCE) API.getMe().then((user) => { if (user) go(user); });
