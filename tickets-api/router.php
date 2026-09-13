<?php
/**
 * Dev router for: php -S 127.0.0.1:8080 router.php
 * Routes /list-messages, /view-messages/*, etc. through index.php
 */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if ($uri !== '/' && $uri !== '' && file_exists(__DIR__ . $uri) && !is_dir(__DIR__ . $uri)) {
    return false;
}

require __DIR__ . '/index.php';
