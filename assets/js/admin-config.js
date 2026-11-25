(function bootstrapAdminConfig() {
    const root = document.getElementById('adminLoginApp');
    if (!root) return;

    const config = {};
    if (root.dataset.assetUrl) config.assetUrl = root.dataset.assetUrl;
    if (root.dataset.apiUrl) config.apiUrl = root.dataset.apiUrl;
    if (root.dataset.publicUrl) config.publicUrl = root.dataset.publicUrl;
    if (root.dataset.adminUrl) config.adminUrl = root.dataset.adminUrl;
    if (root.dataset.dashboardUrl) config.dashboardUrl = root.dataset.dashboardUrl;
    if (root.dataset.loginUrl) config.loginUrl = root.dataset.loginUrl;
    if (root.dataset.planUrl) config.planUrl = root.dataset.planUrl;

    window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, config);
    window.FAMO_ASSET = function (path) {
        const base = (window.APP_CONFIG && window.APP_CONFIG.assetUrl) || '';
        return base.replace(/\/$/, '') + '/' + String(path).replace(/^\//, '');
    };
    window.FAMO_LOGIN_RETURN_URL = root.dataset.returnUrl || '';
})();
