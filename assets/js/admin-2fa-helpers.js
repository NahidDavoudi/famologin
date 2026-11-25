/**
 * Pure helper utilities for Famo Admin Login & 2FA UX.
 * Kept DOM-free so all normalization, formatting, channel visibility,
 * and error classification logic can be deterministically unit-tested.
 */

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/**
 * Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII (0-9).
 */
export function normalizeDigits(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (char) => {
        const code = char.charCodeAt(0);
        if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
            return String(code - PERSIAN_ZERO);
        }
        return String(code - ARABIC_INDIC_ZERO);
    });
}

/**
 * Extracts up to `length` ASCII digits from user input or clipboard paste.
 */
export function extractOtpDigits(raw, length = 6) {
    return normalizeDigits(raw).replace(/\D/g, '').slice(0, length);
}

/**
 * Normalizes a recovery code input (converts Persian/Arabic-Indic digits,
 * trims whitespace, strips spaces while preserving dashes/alphanumerics).
 */
export function normalizeRecoveryCode(raw) {
    return normalizeDigits(raw).trim().replace(/\s+/g, '');
}

/**
 * Converts ASCII digits to Persian numerals for calm RTL UI display.
 */
export function toPersianDigits(value) {
    return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Formats a wait duration in seconds into calm Persian phrasing.
 */
export function formatWaitDuration(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (total <= 0) return '';
    if (total < 60) {
        return `${toPersianDigits(total)} ثانیه`;
    }
    const mins = Math.floor(total / 60);
    const rem = total % 60;
    if (rem === 0) {
        return `${toPersianDigits(mins)} دقیقه`;
    }
    return `${toPersianDigits(mins)} دقیقه و ${toPersianDigits(rem)} ثانیه`;
}

/**
 * Computes which channel-switch and resend controls should be visible/enabled
 * for the active 2FA challenge state.
 */
export function resolveChannelUiState(challenge, options = {}) {
    const channel = (challenge && (challenge.channel || challenge.two_fa_method)) || 'sms';
    const isRecovery = Boolean(options.recoveryMode);
    const available = Array.isArray(challenge && challenge.available_channels)
        ? challenge.available_channels
        : ['sms', 'email', 'totp'];
    const actions = (challenge && challenge.secondary_actions) || {};

    const isOutbound = channel === 'sms' || channel === 'email';
    const sendsRemaining =
        typeof (challenge && challenge.sends_remaining) === 'number'
            ? challenge.sends_remaining
            : null;
    const maxSends =
        typeof (challenge && challenge.max_sends) === 'number'
            ? challenge.max_sends
            : null;

    const showResend = !isRecovery && isOutbound && actions.resend_current !== false;
    const resendExhausted = sendsRemaining !== null && sendsRemaining <= 0;

    // "Didn't receive it? Send via email" — ONLY when on SMS
    const showSendViaEmail =
        !isRecovery &&
        channel === 'sms' &&
        actions.send_via_email !== false &&
        available.includes('email');

    // "Use authenticator app instead" — when not already on TOTP
    const showUseAuthenticator =
        !isRecovery &&
        channel !== 'totp' &&
        actions.use_authenticator !== false &&
        available.includes('totp');

    const destinationMask =
        channel === 'totp'
            ? null
            : (challenge &&
                (challenge.destination_mask ||
                    (channel === 'email' ? challenge.email_mask : challenge.phone_mask))) ||
              null;

    return {
        channel,
        isOutbound,
        isRecovery,
        destinationMask,
        showResend,
        resendExhausted,
        sendsRemaining,
        maxSends,
        showSendViaEmail,
        showUseAuthenticator,
    };
}

/**
 * Returns calm Persian channel instruction text matching the active channel
 * and optional API-supplied message / masked destination.
 */
export function describeChannelPrompt(challenge) {
    const channel = (challenge && (challenge.channel || challenge.two_fa_method)) || 'sms';
    const mask =
        channel === 'totp'
            ? null
            : (challenge &&
                (challenge.destination_mask ||
                    (channel === 'email' ? challenge.email_mask : challenge.phone_mask))) ||
              null;

    if (challenge && typeof challenge.channel_message_fa === 'string' && challenge.channel_message_fa.trim() !== '') {
        return {
            title: channel === 'totp' ? 'تأیید با اپلیکیشن احراز هویت' : 'تأیید هویت دو مرحله‌ای',
            message: challenge.channel_message_fa.trim(),
            destinationMask: mask,
        };
    }

    if (channel === 'email') {
        return {
            title: 'تأیید هویت دو مرحله‌ای',
            message: mask
                ? 'کد تأیید از طریق ایمیل به نشانی زیر ارسال شد.'
                : 'کد تأیید از طریق ایمیل ارسال شد.',
            destinationMask: mask,
        };
    }

    if (channel === 'totp') {
        return {
            title: 'اپلیکیشن احراز هویت',
            message: 'کد ۶ رقمی نمایش‌داده‌شده در اپلیکیشن احراز هویت خود را وارد کنید.',
            destinationMask: null,
        };
    }

    return {
        title: 'تأیید هویت دو مرحله‌ای',
        message: mask
            ? 'کد تأیید از طریق پیامک به شماره زیر ارسال شد.'
            : 'کد تأیید از طریق پیامک ارسال شد.',
        destinationMask: mask,
    };
}

/**
 * Maps API / network / validation errors to calm, generic Persian messages
 * that never reveal which factor failed or whether an account exists.
 */
export function classifyAuthError(error, context = 'login') {
    if (!error) {
        return {
            kind: 'server',
            message: 'خطایی در ارتباط با سرویس رخ داد. لطفاً دوباره تلاش کنید.',
            retryAfter: null,
        };
    }

    const code = String(error.code || '').toUpperCase();
    const status = Number(error.status || 0);
    const rawMsg = String(error.message || '');
    const retryAfter =
        typeof error.retryAfter === 'number' && Number.isFinite(error.retryAfter) && error.retryAfter > 0
            ? Math.ceil(error.retryAfter)
            : null;

    // Network / offline fetch errors
    if (
        error.name === 'TypeError' ||
        code === 'NETWORK_ERROR' ||
        status === 0 && !code && /fetch|network|failed to fetch|load failed/i.test(rawMsg)
    ) {
        return {
            kind: 'network',
            message: 'اتصال به سرور برقرار نشد. اینترنت خود را بررسی کرده و دوباره تلاش کنید.',
            retryAfter: null,
        };
    }

    // Rate limit / temporary lockout
    if (status === 429 || code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS' || code === 'LOCKED_OUT') {
        const waitText = retryAfter ? formatWaitDuration(retryAfter) : '';
        return {
            kind: 'rate_limit',
            message: waitText
                ? `تعداد تلاش‌ها بیش از حد مجاز است. لطفاً پس از ${waitText} دوباره تلاش کنید.`
                : 'تعداد تلاش‌ها بیش از حد مجاز است. لطفاً چند لحظه صبر کرده و دوباره تلاش کنید.',
            retryAfter,
        };
    }

    // Server / service unavailable
    if (status >= 500 || code === 'INTERNAL_ERROR' || code === 'SERVICE_UNAVAILABLE' || code === 'PARSE_ERROR') {
        return {
            kind: 'server',
            message: 'سرویس احراز هویت موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کنید.',
            retryAfter: null,
        };
    }

    // Credentials step: always generic — never indicate username vs password
    if (context === 'login') {
        return {
            kind: 'invalid_credentials',
            message: 'اطلاعات ورود نامعتبر است. نام کاربری و رمز عبور خود را بررسی کنید.',
            retryAfter: null,
        };
    }

    // Expired OTP / expired challenge
    if (
        code.includes('EXPIRED') ||
        code === 'CHALLENGE_INVALID' ||
        /منقضی|expired/i.test(rawMsg)
    ) {
        return {
            kind: 'expired_code',
            message: 'کد تأیید یا نشست ورود منقضی شده است. کد جدیدی درخواست کنید یا دوباره وارد شوید.',
            retryAfter: null,
        };
    }

    // Resend / switch channel failures
    if (context === 'resend' || context === 'switch') {
        return {
            kind: 'channel_error',
            message: 'در حال حاضر امکان ارسال کد از این روش وجود ندارد. لطفاً روش دیگری را امتحان کنید.',
            retryAfter: null,
        };
    }

    // Invalid 2FA / recovery code — generic, never reveals which factor or account state
    return {
        kind: 'invalid_code',
        message: 'کد واردشده معتبر نیست یا منقضی شده است. لطفاً دوباره بررسی کنید.',
        retryAfter: null,
    };
}
