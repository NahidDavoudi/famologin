const { default: API } = await import(`${window.APP_CONFIG.assetUrl}/js/api.js`);

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

function showError(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); successBox.classList.add('hidden'); errorBox.focus(); }
function clearMessages() { errorBox.classList.add('hidden'); successBox.classList.add('hidden'); }
function showSuccess(message) { successBox.textContent = message; successBox.classList.remove('hidden'); errorBox.classList.add('hidden'); }
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
        const result = action === 'login' ? await API.login(data.username, data.password) : await API.register({ ...data, grade: Number(data.grade) });
        if (result.requires_2fa) { $('#twoFactorHint').textContent = `کد تأیید به ${result.email_mask} ارسال شد.`; setButtonLoading(button, false); setMode('2fa'); return; }
        showSuccess('ورود موفق بود. در حال انتقال...');
        window.setTimeout(() => go(result.user), 250);
    } catch (error) {
        showError(error.message || 'خطایی رخ داد. دوباره تلاش کنید.');
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
        const result = await API.verify2fa($('#twoFactorCode').value);
        showSuccess('ورود موفق بود. در حال انتقال...');
        window.setTimeout(() => go(result.user), 250);
    } catch (error) {
        showError(error.message || 'کد تأیید نامعتبر است.');
        setButtonLoading(button, false);
    }
});
$('#cancelTwoFactor').addEventListener('click', () => { API.cancel2fa(); setMode('login'); });

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

API.getMe().then((user) => { if (user) go(user); });
