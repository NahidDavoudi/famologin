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
        const retryAfterRaw = res.headers ? res.headers.get('Retry-After') : null;
        const retryAfter = retryAfterRaw && /^\d+$/.test(retryAfterRaw.trim())
            ? parseInt(retryAfterRaw.trim(), 10)
            : null;
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (e) {
            const parseErr = new Error('خطا در پردازش پاسخ سرور');
            parseErr.code = 'PARSE_ERROR';
            parseErr.status = res.status;
            parseErr.retryAfter = retryAfter;
            throw parseErr;
        }
        if (!json.success) {
            const err = new Error(json.error?.message || 'خطای نامشخص');
            err.code = json.error?.code || 'UNKNOWN';
            err.status = res.status;
            err.data = json;
            err.retryAfter = retryAfter ?? json.error?.retry_after ?? json.data?.retry_after ?? null;
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
            this._pending2FA = {
                user_id: data.user_id,
                username: data.username,
                role: data.role ?? null,
                phone_mask: data.phone_mask ?? null,
                email_mask: data.email_mask ?? null,
                destination_mask: data.destination_mask ?? data.phone_mask ?? data.email_mask ?? null,
                channel: data.channel ?? data.two_fa_method ?? 'sms',
                two_fa_method: data.two_fa_method ?? data.channel ?? 'sms',
                channel_message: data.channel_message ?? null,
                channel_message_fa: data.channel_message_fa ?? null,
                challenge_token: data.challenge_token ?? null,
                expires_in: data.expires_in ?? null,
                resend_cooldown_seconds: data.resend_cooldown_seconds ?? 60,
                sends_used: data.sends_used ?? null,
                max_sends: data.max_sends ?? null,
                sends_remaining: data.sends_remaining ?? null,
                available_channels: Array.isArray(data.available_channels) ? data.available_channels : null,
                secondary_actions: data.secondary_actions ?? null,
            };
            return { requires_2fa: true, ...this._pending2FA };
        }
        this._authenticated = true;
        return { user: data.user };
    },

    async register(data) {
        const res = await this.post('/auth/register', data, { headers: COOKIE_AUTH_HEADERS });
        this._authenticated = true;
        return { user: res.data.user };
    },

    async verify2fa(code, options = {}) {
        if (!this._pending2FA) throw new Error('ابتدا باید وارد شوید');
        const payload = {
            user_id: this._pending2FA.user_id,
            code: String(code)
        };
        if (this._pending2FA.challenge_token) {
            payload.challenge_token = this._pending2FA.challenge_token;
        }
        if (options && options.method) {
            payload.method = options.method;
        }
        const res = await this.post('/auth/verify-2fa', payload, { headers: COOKIE_AUTH_HEADERS });
        this._pending2FA = null;
        this._authenticated = true;
        return {
            user: res.data.user,
            auth_method: res.data.auth_method ?? null,
            remaining_recovery_codes: res.data.remaining_recovery_codes ?? null,
        };
    },

    async resend2fa() {
        if (!this._pending2FA) throw new Error('ابتدا باید وارد شوید');
        const payload = {
            user_id: this._pending2FA.user_id,
            challenge_token: this._pending2FA.challenge_token
        };
        const res = await this.post('/auth/2fa/resend', payload, { headers: COOKIE_AUTH_HEADERS });
        const data = res.data || {};
        this._pending2FA = {
            ...this._pending2FA,
            ...data,
            user_id: data.user_id ?? this._pending2FA.user_id,
            challenge_token: data.challenge_token ?? this._pending2FA.challenge_token,
            channel: data.channel ?? data.two_fa_method ?? this._pending2FA.channel,
            two_fa_method: data.two_fa_method ?? data.channel ?? this._pending2FA.two_fa_method,
        };
        return { ...this._pending2FA };
    },

    async switch2faChannel(channel) {
        if (!this._pending2FA) throw new Error('ابتدا باید وارد شوید');
        const payload = {
            user_id: this._pending2FA.user_id,
            challenge_token: this._pending2FA.challenge_token,
            channel
        };
        const res = await this.post('/auth/2fa/switch-channel', payload, { headers: COOKIE_AUTH_HEADERS });
        const data = res.data || {};
        this._pending2FA = {
            ...this._pending2FA,
            ...data,
            user_id: data.user_id ?? this._pending2FA.user_id,
            challenge_token: data.challenge_token ?? this._pending2FA.challenge_token,
            channel: data.channel ?? data.two_fa_method ?? channel,
            two_fa_method: data.two_fa_method ?? data.channel ?? channel,
        };
        return { ...this._pending2FA };
    },

    getPending2fa() { return this._pending2FA ? { ...this._pending2FA } : null; },

    setPending2fa(challenge) { this._pending2FA = challenge ? { ...challenge } : null; },

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
