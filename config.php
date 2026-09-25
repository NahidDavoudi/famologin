<?php
/**
 * Login runtime configuration. Keep this file inside the public deployment
 * so this application does not depend on the repository's shared/ directory.
 */

if (!function_exists('famo_env')) {
    function famo_load_env(string $file): void
    {
        if (!is_readable($file)) {
            return;
        }

        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if ($key === '') {
                continue;
            }
            if (strlen($value) >= 2 && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) {
                $value = substr($value, 1, -1);
            }
            if (getenv($key) !== false || isset($_ENV[$key]) || isset($_SERVER[$key])) {
                continue;
            }
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }

    // A colocated .env is suitable for a separate deployment; process-level
    // environment variables take precedence over values from that file.
    famo_load_env(__DIR__ . '/.env');

    function famo_env(string $key, string $default = ''): string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
        return ($value === false || $value === null || $value === '') ? $default : (string) $value;
    }

    function famo_app_mode(): string
    {
        return strtolower(trim(famo_env('APP_MODE', famo_env('APP_ENV', 'production'))));
    }

    function famo_is_dev(): bool
    {
        return famo_app_mode() === 'development';
    }

    function famo_asset(string $path, string $fallback): string
    {
        $default = famo_is_dev() ? '' : 'https://assets.famoacademy.ir';
        $base = rtrim(famo_env('ASSET_URL', $default), '/');
        return $base === '' ? $fallback : $base . '/' . ltrim($path, '/');
    }

    function famo_asset_base(): string
    {
        return rtrim(famo_env('ASSET_URL', 'https://assets.famoacademy.ir'), '/');
    }

    function famo_api_url(): string
    {
        $base = rtrim(famo_env('API_URL', 'https://api.famoacademy.ir'), '/');
        return preg_match('#/api/v1$#', $base) ? $base : $base . '/api/v1';
    }

    function famo_public_url(): string
    {
        return rtrim(famo_env('PUBLIC_URL', ''), '/');
    }

    function famo_admin_url(): string
    {
        return rtrim(famo_env('ADMIN_URL', ''), '/');
    }

    function famo_dashboard_url(): string
    {
        return rtrim(famo_env('DASHBOARD_URL', ''), '/');
    }

    function famo_login_url(): string
    {
        return rtrim(famo_env('LOGIN_URL', ''), '/');
    }

    function famo_config_script(): string
    {
        $config = [];
        $assetBase = famo_asset_base();
        $config['assetUrl'] = $assetBase;
        $config['apiUrl'] = famo_api_url();

        foreach ([
            'publicUrl' => famo_public_url(),
            'adminUrl' => famo_admin_url(),
            'dashboardUrl' => famo_dashboard_url(),
            'loginUrl' => famo_login_url(),
        ] as $key => $url) {
            if ($url !== '') {
                $config[$key] = $url;
            }
        }
        if ($config === []) {
            return '';
        }
        $json = json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        return '<script>window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, ' . $json . '); window.FAMO_ASSET = function (path) { var base = (window.APP_CONFIG && window.APP_CONFIG.assetUrl) || ""; return base.replace(/\\/$/, "") + "/" + String(path).replace(/^\\//, ""); };</script>';
    }
}
