import API from '../shared/js/api.js';

const asset = (path) => {
    const base = (window.APP_CONFIG && window.APP_CONFIG.assetUrl) || '../shared';
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
function setMode(mode) { loginBox.classList.toggle('hidden', mode !== 'login'); registerBox.classList.toggle('hidden', mode !== 'register'); twoFactorBox.classList.toggle('hidden', mode !== '2fa'); clearMessages(); }
function destination(user) {
    const roleHome = user.role === 'student' ? '../dashboard/' : '../admin/';
    const returnUrl = window.FAMO_LOGIN_RETURN_URL;

    // A return URL comes from the page that requested authentication. It must
    // not override role routing, otherwise a student can be sent back to the
    // admin guard and bounce between admin and login forever.
    if (returnUrl) {
        const normalized = returnUrl.replace(/\/+$/, '') || '/';
        const allowedPanel = user.role === 'student' ? 'dashboard' : 'admin';
        if (normalized.split('/').includes(allowedPanel)) {
            return returnUrl;
        }
    }

    return roleHome;
}
function go(user) { window.location.assign(destination(user)); }

function validate(form) {
    let valid = true;
    form.querySelectorAll('input, select').forEach((input) => {
        const group = input.closest('.input-group');
        group.classList.remove('error');
        if (!input.checkValidity()) { valid = false; group.classList.add('error'); group.querySelector('.error-message').textContent = input.validity.valueMissing ? 'این فیلد الزامی است' : 'مقدار وارد شده صحیح نیست'; }
    });
    return valid;
}

async function submit(form, action) {
    if (!validate(form)) return;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
        const data = Object.fromEntries(new FormData(form));
        const result = action === 'login' ? await API.login(data.username, data.password) : await API.register({ ...data, grade: Number(data.grade) });
        if (result.requires_2fa) { $('#twoFactorHint').textContent = `کد تأیید به ${result.email_mask} ارسال شد.`; setMode('2fa'); return; }
        showSuccess('ورود موفق بود. در حال انتقال...'); setTimeout(() => go(result.user), 250);
    } catch (error) { showError(error.message || 'خطایی رخ داد. دوباره تلاش کنید.'); }
    finally { button.disabled = false; }
}

$('#loginTab').addEventListener('click', () => { setMode('login'); $('#loginTab').classList.add('active'); $('#registerTab').classList.remove('active'); });
$('#registerTab').addEventListener('click', () => { setMode('register'); $('#registerTab').classList.add('active'); $('#loginTab').classList.remove('active'); });
$('#formLogin').addEventListener('submit', (event) => { event.preventDefault(); submit(event.currentTarget, 'login'); });
$('#formRegister').addEventListener('submit', (event) => { event.preventDefault(); submit(event.currentTarget, 'register'); });
$('#formTwoFactor').addEventListener('submit', async (event) => { event.preventDefault(); if (!validate(event.currentTarget)) return; try { const result = await API.verify2fa($('#twoFactorCode').value); showSuccess('ورود موفق بود. در حال انتقال...'); setTimeout(() => go(result.user), 250); } catch (error) { showError(error.message || 'کد تأیید نامعتبر است.'); } });
$('#cancelTwoFactor').addEventListener('click', () => { API.cancel2fa(); setMode('login'); });
document.querySelectorAll('.password-toggle').forEach((button) => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.passwordTarget); const icon = button.querySelector('img'); const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; icon.src = visible ? asset('svg/eye-open.svg') : asset('svg/eye-closed.svg'); button.setAttribute('aria-label', visible ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'); }));
$('#registerGrade').addEventListener('change', (event) => { const isMiddleSchool = Number(event.target.value) <= 9; $('#fieldGroup').classList.toggle('hidden', isMiddleSchool); $('#registerField').required = !isMiddleSchool; if (isMiddleSchool) $('#registerField').value = 'راهنمایی'; });

API.getMe().then((user) => { if (user) go(user); });
