# Famo Login

Standalone login/registration page. Provides the classic username/password login
and register forms, the supporter 2FA step, and the **Telegram Login Widget**
used to bind a Telegram account to a Famo account. It is a plain PHP page plus
vanilla ES modules; it talks to the API only (no direct database access).

## Configuration

Copy `.env.example` to `.env` and fill it in. The loader (`config.php`) reads a
colocated `.env`, but real process environment variables take precedence.

| Var | Purpose |
|-----|---------|
| `PUBLIC_URL` | Public site base; used for the "back to site" link. |
| `ADMIN_URL` | Supporter/admin panel base; post-login destination. |
| `DASHBOARD_URL` | Student panel base; post-login destination. |
| `LOGIN_URL` | This page's base; the widget's `data-auth-url`. |
| `ASSET_URL` | Shared asset host (CSS/JS/SVG). Empty in development uses local fallbacks. |
| `API_URL` | API base; `/api/v1` is appended automatically. |
| `TELEGRAM_BOT_USERNAME` | Login Widget bot username **without** the leading `@`. Rendered as `data-telegram-login`. |
| `APP_MODE` | `development` switches asset URL resolution to local fallbacks. |

## Telegram binding flow (high level)

1. The bot shows a **fixed URL button** to this page with
   `?source=telegram` (`BOT_LOGIN_URL=https://<site-host>/login?source=telegram`).
   No per-user signed links, and the Telegram user id is never put in the URL.
2. `source=telegram` makes the page render the widget and **skip the
   auto-redirect** for a browser that already has a session, so already
   logged-in users still reach the widget.
3. The user completes the Telegram widget. The page posts the payload to
   `POST /auth/telegram/verify`.
4. If the Telegram account is not yet linked, the API returns a short-lived
   **ticket** and the page offers "login to existing account" or "register".
   It then calls `/auth/telegram/link`, `/auth/telegram/register`, or (for
   supporters) `/auth/telegram/verify-2fa`.
5. On success the API returns `bot_redirect_url` and the page redirects the
   user back to `https://t.me/<bot>?start=linked`. If the Telegram account is
   already linked, `verify` returns `linked:true` and the page redirects
   immediately (no ticket, no session).

Tickets are single-use, short-lived, and travel in the request body only — never
in a URL.

## BotFather and same-bot requirements

- **HTTPS required.** The widget will not load over plain HTTP. Register the
  site host in **@BotFather** with `/setdomain`.
- **One domain per bot.** A bot has a single `/setdomain` value; the host
  serving this page must be that bot's registered domain. A mismatch makes
  `verify` fail with `TELEGRAM_AUTH_INVALID`.
- **Same bot everywhere.** The widget bot (`TELEGRAM_BOT_USERNAME`), the bot
  host bot, and the API's derived key `TELEGRAM_LOGIN_SECRET_KEY` must all
  belong to the **same** bot.
- `TELEGRAM_LOGIN_SECRET_KEY` is the hex `SHA256(bot_token)`. The API stores
  only the derived value, never the bot token. Compute it locally:

  ```bash
  php -r "echo hash('sha256', '<BOT_TOKEN>');"
  ```

The page may open inside **Telegram's in-app browser**, so test the widget there
too. In Iran, `oauth.telegram.org` (the widget's login popup) may be unreachable
without a VPN; the page shows a Persian fallback hint advising a VPN/filter
check and retry.

## Session / cookie note

After a successful link the site may set an **HttpOnly** auth cookie so the
panel fallback (the role panel) works in the browser. When the user is
redirected back to the bot (`bot_redirect_url` is present) **no session is
persisted** — the redirect happens immediately. If the API has no
`TELEGRAM_BOT_URL`, `bot_redirect_url` is null and the page falls back to the
role panel using the cookie.

## Manual test checklist

- [ ] **Already logged-in + `?source=telegram`**: a user with an existing
      session opening `/login?source=telegram` stays on the page (is **not**
      auto-redirected to the panel) and reaches the widget/linking step.
- [ ] **Retry errors**: on `TELEGRAM_TICKET_INVALID` / `TELEGRAM_AUTH_INVALID` /
      `TELEGRAM_REPLAY` the UI resets to the widget state and shows the Persian
      retry message **without a page reload**.
- [ ] **Missing `TELEGRAM_BOT_URL` on the API** (`bot_redirect_url` null): the
      linked/already-linked UI shows a neutral message and there is **no** "back
      to Telegram" button.
- [ ] **Missing `TELEGRAM_BOT_USERNAME`** in this `.env`: the widget is not
      rendered and a config error is written to the log.
- [ ] **Widget fails to load** (blocked/unreachable): after ~5 seconds the
      Persian fallback hint appears and the page remains usable.
- [ ] **`?source=telegram` UI**: tabs/forms are hidden until the widget
      verification succeeds (ticket obtained); the normal page (no `source`) is
      unchanged.
