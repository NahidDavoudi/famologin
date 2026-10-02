/**
 * Famo Unified API Client
 * Shared across all frontend applications (Public, Admin, Dashboard, Nobat, Plan)
 *
 * Base URL is injected from the panel's PHP config.php, which reads API_URL
 * from the panel's .env file.
 *
 * Usage:
 *   import API from './shared/js/api.js';
 *   const courses = await API.get('/public/courses');
 *   await API.login('admin', '1234');
 */

// ES modules are deferred, so DOMContentLoaded may have fired before their entry code runs.
// Use onReady() rather than adding DOMContentLoaded listeners directly.
export function onReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

function normalizeBase(url) {
    if (!url) return '';
    const trimmed = String(url).replace(/\/+$/, '');
    if (/\/api\/v1$/.test(trimmed)) return trimmed;
    return trimmed + '/api/v1';
}

const CONFIGURED = normalizeBase(window.APP_CONFIG && window.APP_CONFIG.apiUrl);
if (!CONFIGURED) {
    throw new Error('API_URL is missing from the panel runtime configuration.');
}
const BASE = CONFIGURED;
const COOKIE_AUTH_HEADERS = { 'X-Auth-Mode': 'cookie' };

const API = {
    base: BASE,

    _pending2FA: null,
    _authenticated: false,

    _headers(hasFiles = false, headers = {}) {
        const h = {};
        if (!hasFiles) h['Content-Type'] = 'application/json';
        return { ...h, ...headers };
    },

    async _fetch(method, path, data = null, hasFiles = false, headers = {}) {
        const url = this.base + path;
        const options = {
            method,
            headers: this._headers(hasFiles, headers),
            credentials: 'include',
            mode: 'cors',
        };
        if (data !== null) {
            options.body = hasFiles ? data : JSON.stringify(data);
        }
        const res = await fetch(url, options);
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (e) {
            throw { code: 'PARSE_ERROR', message: 'خطا در پردازش پاسخ سرور' };
        }
        if (!json.success) {
            const err = new Error(json.error?.message || 'خطای نامشخص');
            err.code = json.error?.code || 'UNKNOWN';
            err.status = res.status;
            err.data = json;
            throw err;
        }
        return json;
    },

    get(path, options = {}) { return this._fetch('GET', path, null, false, options.headers); },

    post(path, data, options = {}) { return this._fetch('POST', path, data, false, options.headers); },

    put(path, data, options = {}) { return this._fetch('PUT', path, data, false, options.headers); },

    del(path, options = {}) { return this._fetch('DELETE', path, null, false, options.headers); },

    async upload(path, formData, method = 'POST', options = {}) {
        return this._fetch(method, path, formData, true, options.headers);
    },

    async login(username, password) {
        const res = await this.post('/auth/login', { username, password }, { headers: COOKIE_AUTH_HEADERS });
        const data = res.data;
        if (data.requires_2fa) {
            this._pending2FA = { user_id: data.user_id, username: data.username, email_mask: data.email_mask };
            return { requires_2fa: true, email_mask: data.email_mask, username: data.username };
        }
        this._authenticated = true;
        return { user: data.user };
    },

    async register(data) {
        const res = await this.post('/auth/register', data, { headers: COOKIE_AUTH_HEADERS });
        this._authenticated = true;
        return { user: res.data.user };
    },

    async verify2fa(code) {
        if (!this._pending2FA) throw new Error('ابتدا باید وارد شوید');
        const res = await this.post('/auth/verify-2fa', {
            user_id: this._pending2FA.user_id,
            code: String(code)
        }, { headers: COOKIE_AUTH_HEADERS });
        this._pending2FA = null;
        this._authenticated = true;
        return { user: res.data.user };
    },

    is2faPending() { return this._pending2FA !== null; },

    cancel2fa() { this._pending2FA = null; },

    telegramVerify(payload) { return this.post('/auth/telegram/verify', payload, { headers: COOKIE_AUTH_HEADERS }); },

    telegramRegister(data) { return this.post('/auth/telegram/register', data, { headers: COOKIE_AUTH_HEADERS }); },

    telegramLink(data) { return this.post('/auth/telegram/link', data, { headers: COOKIE_AUTH_HEADERS }); },

    telegramVerify2fa(data) {
        return this.post('/auth/telegram/verify-2fa', {
            ticket: data.ticket,
            challenge_id: data.challenge_id,
            code: String(data.code)
        }, { headers: COOKIE_AUTH_HEADERS });
    },

    async logout() {
        try {
            await this.post('/auth/logout', null, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        } catch (e) {
            // The browser drops the HttpOnly cookie only when the API can clear it.
        } finally {
            this._pending2FA = null;
            this._authenticated = false;
        }
    },

    isLoggedIn() { return this._authenticated; },

    async getMe() {
        try {
            const res = await this.get('/auth/me');
            this._authenticated = true;
            return res.data;
        } catch (e) {
            this._authenticated = false;
            return null;
        }
    },

    pagination(res) {
        return res.pagination || null;
    },

    hasMore(res) {
        const p = res.pagination;
        return p ? p.page < p.total_pages : false;
    }
};

export default API;
