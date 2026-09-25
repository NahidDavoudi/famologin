<?php
require_once __DIR__ . '/config.php';

$returnUrl = $_GET['return_url'] ?? '';
$parsedReturnUrl = is_string($returnUrl) ? parse_url($returnUrl) : false;
if (
    !is_string($returnUrl)
    || $parsedReturnUrl === false
    || isset($parsedReturnUrl['scheme'], $parsedReturnUrl['host'])
    || !str_starts_with($returnUrl, '/')
    || str_starts_with($returnUrl, '//')
) {
    $returnUrl = '';
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>ورود و ثبت‌نام | آموزشگاه فامو</title>
    <?php echo famo_config_script(); ?>
    <link rel="stylesheet" href="<?php echo famo_asset('css/output.css', '../shared/css/output.css'); ?>">
    <link rel="stylesheet" href="<?php echo famo_asset('css/tokens.css', '../shared/css/tokens.css'); ?>">
    <link rel="stylesheet" href="assets/css/login.css">
</head>
<body class="min-h-screen bg-background text-slate-900 antialiased">
<main class="mx-auto grid min-h-screen w-full max-w-6xl place-items-center gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_.95fr]">
    <section class="w-full max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-lg sm:p-8 lg:p-10">
        <div class="mb-7 text-center">
            <div class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary-light text-primary" aria-hidden="true"><i data-lucide="graduation-cap" class="size-7"></i></div>
            <h1 class="text-2xl font-bold tracking-tight text-primary sm:text-3xl">به فامو خوش آمدید</h1>
            <p class="mt-2 text-sm text-muted-foreground">برای ورود به پنل خود، اطلاعات حساب را وارد کنید.</p>
        </div>

        <div class="mb-6 flex gap-1 rounded-xl bg-surface-muted p-1" role="tablist" aria-label="احراز هویت">
            <button class="tab-btn min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary" id="loginTab" type="button" role="tab" aria-selected="true">وارد شدن</button>
            <button class="tab-btn min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary" id="registerTab" type="button" role="tab" aria-selected="false">ثبت نام</button>
        </div>

        <div id="formErrorSummary" class="form-message error hidden" role="alert" tabindex="-1"></div>
        <div id="formSuccessSummary" class="form-message success hidden" role="status"></div>

        <div id="loginFormContainer" role="tabpanel">
            <form id="formLogin" novalidate>
                <div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="loginUsername">شماره موبایل یا نام کاربری</label><div class="relative"><i data-lucide="user-round" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"></i><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 pr-11 text-sm transition focus:border-primary focus:bg-surface" id="loginUsername" name="username" type="text" autocomplete="username" required></div><span class="error-message"></span></div>
                <div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="loginPassword">رمز عبور</label><div class="relative"><i data-lucide="lock-keyhole" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"></i><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 pl-14 pr-11 text-sm transition focus:border-primary focus:bg-surface" id="loginPassword" name="password" type="password" minlength="4" autocomplete="current-password" required><button class="password-toggle absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-primary transition hover:bg-primary-light" type="button" data-password-target="loginPassword" aria-label="نمایش رمز عبور"><img src="<?php echo famo_asset('svg/eye-closed.svg', '../shared/svg/eye-closed.svg'); ?>" alt="" class="size-5"></button></div><span class="error-message"></span></div>
                <button class="primary-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60" type="submit"><i data-lucide="log-in" class="size-5" aria-hidden="true"></i>ورود</button>
            </form>
        </div>

        <div id="registerFormContainer" class="hidden" role="tabpanel">
            <form id="formRegister" novalidate>
                <div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="registerName">نام و نام خانوادگی</label><div class="relative"><i data-lucide="user-round" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"></i><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 pr-11 text-sm transition focus:border-primary focus:bg-surface" id="registerName" name="name" type="text" minlength="3" autocomplete="name" required></div><span class="error-message"></span></div>
                <div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="registerPhone">شماره موبایل</label><div class="relative"><i data-lucide="phone" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"></i><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 pr-11 text-sm transition focus:border-primary focus:bg-surface" id="registerPhone" name="phone" type="tel" pattern="09[0-9]{9}" autocomplete="tel" required></div><span class="error-message"></span></div>
                <div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="registerNationalId">کد ملی</label><div class="relative"><i data-lucide="id-card" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"></i><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 pr-11 text-sm transition focus:border-primary focus:bg-surface" id="registerNationalId" name="nationalId" type="text" inputmode="numeric" pattern="[0-9]{10}" required></div><span class="error-message"></span></div>
                <div class="grid gap-4 sm:grid-cols-2"><div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="registerGrade">پایه</label><select class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 text-sm transition focus:border-primary focus:bg-surface" id="registerGrade" name="grade" required><option value="">انتخاب پایه</option><option value="7">هفتم</option><option value="8">هشتم</option><option value="9">نهم</option><option value="10">دهم</option><option value="11">یازدهم</option><option value="12">دوازدهم</option></select><span class="error-message"></span></div><div class="input-group mb-4" id="fieldGroup"><label class="mb-2 block text-sm font-medium" for="registerField">رشته</label><select class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 text-sm transition focus:border-primary focus:bg-surface" id="registerField" name="field" required><option value="">انتخاب رشته</option><option value="تجربی">تجربی</option><option value="ریاضی">ریاضی</option><option value="انسانی">انسانی<option value="راهنمایی">راهنمایی</option></select><span class="error-message"></span></div></div>
                <div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="registerPassword">رمز عبور</label><div class="relative"><i data-lucide="lock-keyhole" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"></i><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 pl-14 pr-11 text-sm transition focus:border-primary focus:bg-surface" id="registerPassword" name="password" type="password" minlength="4" autocomplete="new-password" required><button class="password-toggle absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-primary transition hover:bg-primary-light" type="button" data-password-target="registerPassword" aria-label="نمایش رمز عبور"><img src="<?php echo famo_asset('svg/eye-closed.svg', '../shared/svg/eye-closed.svg'); ?>" alt="" class="size-5"></button></div><span class="error-message"></span></div>
                <button class="primary-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60" type="submit"><i data-lucide="user-plus" class="size-5" aria-hidden="true"></i>ثبت نام</button>
            </form>
        </div>

        <div id="twoFactorContainer" class="hidden"><p id="twoFactorHint" class="mb-4 text-center text-sm leading-7 text-muted-foreground"></p><form id="formTwoFactor" novalidate><div class="input-group mb-4"><label class="mb-2 block text-sm font-medium" for="twoFactorCode">کد تأیید شش رقمی</label><input class="h-12 w-full rounded-xl border border-input bg-surface-muted px-4 text-center text-lg tracking-[.35em] transition focus:border-primary focus:bg-surface" id="twoFactorCode" name="code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required><span class="error-message"></span></div><button class="primary-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover" type="submit"><i data-lucide="shield-check" class="size-5" aria-hidden="true"></i>تأیید و ورود</button><button class="secondary-button mt-2 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary-light" id="cancelTwoFactor" type="button">بازگشت</button></form></div>
        <a class="mt-6 block text-center text-sm text-muted-foreground transition hover:text-primary" href="<?= htmlspecialchars(famo_public_url() . '/index.php', ENT_QUOTES, 'UTF-8') ?>"><i data-lucide="arrow-right" class="ml-1 inline-block size-4 align-middle" aria-hidden="true"></i>بازگشت به صفحه اصلی</a>
    </section>
    <aside class="login-branding hidden w-full max-w-xl rounded-2xl p-10 text-center text-white shadow-lg lg:grid lg:min-h-[620px] lg:place-content-center lg:gap-5"><img src="<?php echo famo_asset('images/logo.png', '../shared/images/logo.png'); ?>" alt="لوگوی آموزشگاه فامو" class="mx-auto h-20 w-auto"><h2 class="text-3xl font-bold">آینده تحصیلی خود را با فامو بسازید</h2><p class="text-base leading-8 text-white/85">یک حساب واحد برای دسترسی امن به خدمات و پنل‌های فامو.</p></aside>
</main>
<script src="<?php echo famo_asset('js/libs/lucide.min.js', '../shared/js/libs/lucide.min.js'); ?>"></script>
<script>window.FAMO_LOGIN_RETURN_URL = <?= json_encode($returnUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>; window.lucide?.createIcons();</script>
<script type="module" src="assets/js/login.js"></script>
</body>
</html>
