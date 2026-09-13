<?php
/**
 * Live QGIS map JavaScript (served from API — avoids SPA fallback on missing static file).
 * GET /api/map-live-app.php
 */
declare(strict_types=1);

function mapLiveAppResolvePath(): ?string
{
    $candidates = [
        __DIR__ . DIRECTORY_SEPARATOR . 'map-live-data' . DIRECTORY_SEPARATOR . 'live-map.js',
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'qgis2web_2025_09_22-15_58_48_034179' . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'live-map.js',
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'qgis2web_2025_09_22-15_58_48_034179' . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'live-map.js',
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'deploy-ready' . DIRECTORY_SEPARATOR . 'qgis2web_2025_09_22-15_58_48_034179' . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'live-map.js',
    ];

    foreach ($candidates as $path) {
        if (is_readable($path)) {
            return $path;
        }
    }

    return null;
}

$path = mapLiveAppResolvePath();
if (!$path) {
    http_response_code(404);
    header('Content-Type: application/javascript; charset=utf-8');
    echo '/* live-map.js not found */';
    exit;
}

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Frame-Options: SAMEORIGIN');

readfile($path);
