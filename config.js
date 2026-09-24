/* Static environment config. Load before any other script in <head>. */
const APP_CONFIG = (function () {
    const host = window.location.hostname;
    const isDev = host === 'localhost' || host === '127.0.0.1';
    return {
        assetUrl: isDev ? '../shared' : 'https://assets.famoacademy.ir',
        apiUrl: isDev ? 'http://localhost:8080/api/v1' : 'https://api.famoacademy.ir/api/v1',
    };
})();

window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, APP_CONFIG);
window.FAMO_ASSET = function (path) {
    return APP_CONFIG.assetUrl.replace(/\/$/, '') + '/' + String(path).replace(/^\//, '');
};
