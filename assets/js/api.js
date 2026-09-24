/**
 * Famo Unified API Client
 * Shared across all frontend applications (Public, Admin, Dashboard, Nobat, Plan)
 *
 * Base URL resolution order:
 *   1. window.APP_CONFIG.apiUrl (set by shared/js/config.js or injected from PHP .env)
 *   2. hostname auto-detection fallback (localhost vs production)
 *
 * Usage:
 *   import API from './shared/js/api.js';
 *   const courses = await API.get('/public/courses');
 *   await API.login('admin', '1234');
 */

const DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function normalizeBase(url) {
    if (!url) return '';
    const trimmed = String(url).replace(/\/+$/, '');
    if (/\/api\/v1$/.test(trimmed)) return trimmed;
    return trimmed + '/api/v1';
}

const CONFIGURED = normalizeBase(window.APP_CONFIG && window.APP_CONFIG.apiUrl);
const BASE = CONFIGURED || (DEV ? 'http://localhost:8080/api/v1' : 'https://api.famoacademy.ir/api/v1');

const API = {
    base: BASE,

    _token: localStorage.getItem('famo_jwt'),
    _pending2FA: null,

    get token() { return this._token; },

    set token(val) {
        this._token = val;
        if (val) localStorage.setItem('famo_jwt', val);
        else localStorage.removeItem('famo_jwt');
    },

    _headers(hasFiles = false) {
        const h = {};
        if (!hasFiles) h['Content-Type'] = 'application/json';
        if (this._token) h['Authorization'] = `Bearer ${this._token}`;
        return h;
    },

    async _fetch(method, path, data = null, hasFiles = false) {
        const url = this.base + path;
        const options = { method, headers: this._headers(hasFiles) };
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

    get(path) { return this._fetch('GET', path); },

    post(path, data) { return this._fetch('POST', path, data); },

    put(path, data) { return this._fetch('PUT', path, data); },

    del(path) { return this._fetch('DELETE', path); },

    async upload(path, formData, method = 'POST') {
        return this._fetch(method, path, formData, true);
    },

    async login(username, password) {
        const res = await this.post('/auth/login', { username, password });
        const data = res.data;
        if (data.requires_2fa) {
            this._pending2FA = { user_id: data.user_id, username: data.username, email_mask: data.email_mask };
            return { requires_2fa: true, email_mask: data.email_mask, username: data.username };
        }
        this.token = data.token;
        return { user: data.user };
    },

    async register(data) {
        const res = await this.post('/auth/register', data);
        this.token = res.data.token;
        return { user: res.data.user };
    },

    async verify2fa(code) {
        if (!this._pending2FA) throw new Error('ابتدا باید وارد شوید');
        const res = await this.post('/auth/verify-2fa', {
            user_id: this._pending2FA.user_id,
            code: String(code)
        });
        this.token = res.data.token;
        this._pending2FA = null;
        return { user: res.data.user };
    },

    is2faPending() { return this._pending2FA !== null; },

    cancel2fa() { this._pending2FA = null; },

    async logout() {
        try {
            if (this._token) await this.post('/auth/logout');
        } catch (e) {
            // Clear local credentials even if the stateless API is unavailable.
        } finally {
            this.token = null;
            this._pending2FA = null;
        }
    },

    isLoggedIn() { return !!this._token; },

    async getMe() {
        if (!this._token) return null;
        try {
            const res = await this.get('/auth/me');
            return res.data;
        } catch (e) {
            if (e.status === 401) this.token = null;
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
