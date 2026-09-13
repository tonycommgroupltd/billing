<?php
/**
 * RouterOS CLI bridge for olt-api (uses Laravel vendor on VPS).
 * Usage: php routerOsCli.php <action> '<json>'
 * Actions: ping, snmpWalk, resource
 */
require '/var/www/html/tonycomm_api/vendor/autoload.php';

use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

$action = $argv[1] ?? '';
$params = json_decode($argv[2] ?? '{}', true) ?: [];

$envFile = dirname(__DIR__) . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line[0] === '#' || strpos($line, '=') === false) continue;
        putenv(trim($line));
    }
}

$config = new Config([
    'host' => getenv('ROUTEROS_HOST') ?: '102.0.26.60',
    'user' => getenv('ROUTEROS_USER') ?: 'api',
    'pass' => getenv('ROUTEROS_PASSWORD') ?: '',
    'port' => (int)(getenv('ROUTEROS_PORT') ?: 8728),
    'timeout' => (int)(getenv('ROUTEROS_TIMEOUT') ?: 300),
]);

try {
    $client = new Client($config);
    switch ($action) {
        case 'resource':
            $rows = $client->query((new Query('/system/resource/print')))->read();
            echo json_encode(['ok' => true, 'data' => $rows[0] ?? []]);
            break;

        case 'ping':
            $q = (new Query('/ping'))
                ->equal('address', $params['host'] ?? '')
                ->equal('count', (string)($params['count'] ?? 2));
            if (!empty($params['interface'])) {
                $q->equal('interface', $params['interface']);
            }
            $rows = $client->query($q)->read();
            $last = $rows[count($rows) - 1] ?? $rows[0] ?? [];
            $received = (int)($last['received'] ?? 0);
            echo json_encode([
                'ok' => true,
                'reachable' => $received > 0,
                'packetLoss' => $last['packet-loss'] ?? '100',
                'raw' => $rows,
            ]);
            break;

        case 'snmpWalk':
            $rows = $client->query((new Query('/tool/snmp-walk'))
                ->equal('address', $params['host'] ?? '')
                ->equal('community', $params['community'] ?? 'public')
                ->equal('oid', $params['oid'] ?? '1.3.6.1.2.1.1'))->read();
            $snmpErr = null;
            if (isset($rows['after']['message'])) {
                $snmpErr = $rows['after']['message'];
            } elseif (count($rows) === 1) {
                $first = reset($rows);
                if (is_array($first) && isset($first['after']['message'])) {
                    $snmpErr = $first['after']['message'];
                }
            }
            if ($snmpErr !== null) {
                echo json_encode(['ok' => false, 'error' => $snmpErr, 'rows' => $rows]);
                break;
            }
            echo json_encode(['ok' => true, 'rows' => $rows]);
            break;

        default:
            echo json_encode(['ok' => false, 'error' => 'Unknown action']);
            exit(1);
    }
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    exit(1);
}
