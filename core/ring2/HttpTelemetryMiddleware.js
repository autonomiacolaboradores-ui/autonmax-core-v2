const { performance } = require('perf_hooks');

function HttpTelemetryMiddleware(req, res, next) {
    if (process.env.ENABLE_TELEMETRY === 'false') {
        return next();
    }

    const start = performance.now();
    const originalJson = res.json;
    let responseBody = null;

    res.json = function (data) {
        responseBody = data;
        return originalJson.apply(this, arguments);
    };

    res.on('finish', () => {
        const duration = (performance.now() - start).toFixed(2);
        const status = res.statusCode;
        const method = req.method;
        const url = req.originalUrl || req.url;

        let icon = '🟢';
        if (status >= 400 && status < 500) icon = '🟡';
        if (status >= 500) icon = '🔴';

        let errorDetail = '';
        if (status >= 400 && responseBody) {
            const reason = responseBody.error || responseBody.message || JSON.stringify(responseBody);
            errorDetail = ` | Causa Raiz: ${reason}`;
        }

        console.log(`[TELEMETRY] ${icon} ${method} ${url} | Status: ${status} | Latência: ${duration}ms${errorDetail}`);
    });

    next();
}

module.exports = HttpTelemetryMiddleware;
