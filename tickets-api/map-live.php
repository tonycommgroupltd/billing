<?php
/**
 * Live QGIS map page (served from API so it is not caught by React SPA fallback).
 * GET /api/map-live.php?api=https://example.com/api
 */
declare(strict_types=1);

function mapLiveResolvePath(string $relative): ?string
{
    $relative = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relative), DIRECTORY_SEPARATOR);
    $fileName = basename($relative);
    $candidates = [
        __DIR__ . DIRECTORY_SEPARATOR . 'map-live-data' . DIRECTORY_SEPARATOR . $fileName,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . $relative,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . $relative,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'deploy-ready' . DIRECTORY_SEPARATOR . $relative,
    ];

    foreach ($candidates as $path) {
        if (is_readable($path)) {
            return $path;
        }
    }

    return null;
}

$qgisBase = '/qgis2web_2025_09_22-15_58_48_034179';
$htmlPath = mapLiveResolvePath('live.html');
$jsPath = mapLiveResolvePath('live-map.js');

if (!$htmlPath || !$jsPath) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Live map files are missing on the server. Upload qgis2web live.html and live-map.js.';
    exit;
}

$html = file_get_contents($htmlPath);
if ($html === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Unable to read live map template.';
    exit;
}

$appJsVersion = (string) filemtime($jsPath);
$replacements = [
    'defer src="./resources/live-map.js"' => 'defer src="/api/map-live-app.php?v=' . $appJsVersion . '"',
    './resources/' => $qgisBase . '/resources/',
    'href="resources/' => 'href="' . $qgisBase . '/resources/',
    'src="resources/' => 'src="' . $qgisBase . '/resources/',
    'href="styles/' => 'href="' . $qgisBase . '/styles/',
    'src="styles/' => 'src="' . $qgisBase . '/styles/',
    'defer src="' . $qgisBase . '/resources/live-map.js"' => 'defer src="/api/map-live-app.php?v=' . $appJsVersion . '"',
];

$html = str_replace(array_keys($replacements), array_values($replacements), $html);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Frame-Options: SAMEORIGIN');

echo $html;
