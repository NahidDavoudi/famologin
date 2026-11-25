export interface ChallengePayload {
    channel?: 'sms' | 'email' | 'totp' | string;
    two_fa_method?: 'sms' | 'email' | 'totp' | string;
    channel_message?: string | null;
    channel_message_fa?: string | null;
    destination_mask?: string | null;
    phone_mask?: string | null;
    email_mask?: string | null;
    sends_remaining?: number | null;
    max_sends?: number | null;
    available_channels?: string[];
    secondary_actions?: {
        resend_current?: boolean;
        send_via_email?: boolean;
        use_authenticator?: boolean;
    };
}

export interface ChannelUiState {
    channel: string;
    isOutbound: boolean;
    isRecovery: boolean;
    destinationMask: string | null;
    showResend: boolean;
    resendExhausted: boolean;
    sendsRemaining: number | null;
    maxSends: number | null;
    showSendViaEmail: boolean;
    showUseAuthenticator: boolean;
}

export interface ChannelPrompt {
    title: string;
    message: string;
    destinationMask: string | null;
}

export interface AuthErrorLike {
    name?: string;
    code?: string;
    status?: number;
    message?: string;
    retryAfter?: number | null;
}

export interface ClassifiedAuthError {
    kind:
        | 'network'
        | 'rate_limit'
        | 'server'
        | 'invalid_credentials'
        | 'expired_code'
        | 'channel_error'
        | 'invalid_code';
    message: string;
    retryAfter: number | null;
}

export function normalizeDigits(value: unknown): string;
export function extractOtpDigits(raw: unknown, length?: number): string;
export function normalizeRecoveryCode(raw: unknown): string;
export function toPersianDigits(value: string | number): string;
export function formatWaitDuration(seconds: number): string;
export function resolveChannelUiState(
    challenge: ChallengePayload | null | undefined,
    options?: { recoveryMode?: boolean }
): ChannelUiState;
export function describeChannelPrompt(
    challenge: ChallengePayload | null | undefined
): ChannelPrompt;
export function classifyAuthError(
    error: AuthErrorLike | null | undefined,
    context?: 'login' | 'verify' | 'resend' | 'switch'
): ClassifiedAuthError;
