<?php
/**
 * Technician AI Assistant — OpenAI on server (API key never sent to browser).
 * Routes: GET /api/assistant/status | POST /api/assistant/chat
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$allowedRoles = ['technician', 'engineer', 'administrator', 'super-administrator', 'manager'];

function assistantJson($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function assistantRequireUser($allowedRoles) {
    try {
        $user = checkAuth();
    } catch (Exception $e) {
        assistantJson(401, ['success' => false, 'error' => 'Unauthorized']);
    }
    $roles = $user['roles'] ?? [];
    if (!array_intersect($allowedRoles, $roles)) {
        assistantJson(403, ['success' => false, 'error' => 'Assistant not available for your role']);
    }
    return $user;
}

function getOpenAISettings() {
    $config = loadAppConfig();
    $openai = $config['openai'] ?? [];
    $key = trim((string)($openai['api_key'] ?? ''));
    if ($key === '') {
        $env = getenv('OPENAI_API_KEY');
        if ($env !== false && trim($env) !== '') {
            $key = trim($env);
        }
    }
    return [
        'api_key' => $key,
        'model' => trim((string)($openai['model'] ?? 'gpt-4o-mini')) ?: 'gpt-4o-mini',
    ];
}

function parseAssistantPath() {
    $pathInfo = $_SERVER['PATH_INFO'] ?? '';
    if ($pathInfo !== '') {
        $parts = array_values(array_filter(explode('/', trim($pathInfo, '/'))));
        return $parts[0] ?? '';
    }
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $parts = array_values(array_filter(explode('/', trim($uri, '/'))));
    $idx = array_search('assistant', $parts, true);
    if ($idx !== false && isset($parts[$idx + 1])) {
        return $parts[$idx + 1];
    }
    return $parts[count($parts) - 1] ?? '';
}

function ticketStatusEnum() {
    return [
        'new', 'open', 'resolved', 'installation complete', 'waiting_customer', 'waiting_agent',
        'waiting_power', 'power_available', 'customer_unreachable', 'booked_later', 'out_of_range',
        'installed_elsewhere', 'long_distance', 'pole_needed', 'closed',
    ];
}

function openAITools() {
    $statuses = ticketStatusEnum();
    return [
        [
            'type' => 'function',
            'function' => [
                'name' => 'update_ticket_status',
                'description' => 'Update a ticket status for the technician',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'ticket_id' => ['type' => 'integer', 'description' => 'Ticket ID number'],
                        'status' => ['type' => 'string', 'enum' => $statuses],
                    ],
                    'required' => ['ticket_id', 'status'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'add_ticket_note',
                'description' => 'Add an internal note to a ticket',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'ticket_id' => ['type' => 'integer'],
                        'note' => ['type' => 'string'],
                    ],
                    'required' => ['ticket_id', 'note'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'navigate_ticket',
                'description' => 'Open a ticket in the app (no server change)',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'ticket_id' => ['type' => 'integer'],
                    ],
                    'required' => ['ticket_id'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'list_my_tickets',
                'description' => 'List open tickets assigned to the current technician',
                'parameters' => ['type' => 'object', 'properties' => (object)[]],
            ],
        ],
    ];
}

function callOpenAIChat($settings, $messages) {
    $payload = json_encode([
        'model' => $settings['model'],
        'messages' => $messages,
        'tools' => openAITools(),
        'tool_choice' => 'auto',
        'temperature' => 0.2,
    ]);

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $settings['api_key'],
        ],
    ]);
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($errno) {
        throw new RuntimeException('OpenAI request failed: curl error ' . $errno);
    }
    $decoded = json_decode($raw, true);
    if ($httpCode >= 400 || !is_array($decoded)) {
        $err = is_array($decoded) ? ($decoded['error']['message'] ?? $raw) : $raw;
        throw new RuntimeException('OpenAI error (' . $httpCode . '): ' . $err);
    }
    return $decoded;
}

function toolCallToIntent($name, $args, $contextTicketId) {
    $args = is_array($args) ? $args : [];
    switch ($name) {
        case 'update_ticket_status':
            $tid = (int)($args['ticket_id'] ?? $contextTicketId ?? 0);
            return [
                'type' => 'update_status',
                'ticketId' => $tid,
                'status' => trim((string)($args['status'] ?? '')),
            ];
        case 'add_ticket_note':
            return [
                'type' => 'add_note',
                'ticketId' => (int)($args['ticket_id'] ?? 0),
                'note' => trim((string)($args['note'] ?? '')),
            ];
        case 'navigate_ticket':
            return [
                'type' => 'navigate_ticket',
                'ticketId' => (int)($args['ticket_id'] ?? 0),
            ];
        case 'list_my_tickets':
            return ['type' => 'list_my_tickets'];
        default:
            return null;
    }
}

function buildSystemPrompt($user, $context) {
    $name = $user['name'] ?? $user['email'] ?? 'Technician';
    $ticketId = !empty($context['ticket_id']) ? (int)$context['ticket_id'] : null;
    $ctx = $ticketId
        ? "The user is viewing ticket #{$ticketId}. Use that ID when they say \"this ticket\" without a number."
        : 'No ticket is open in the UI.';
    return "You are TCOM Assistant for field technicians at TonyComm Group. "
        . "User: {$name}. {$ctx} "
        . "Use tools to change ticket status, add notes, list assigned tickets, or navigate. "
        . "Be brief. Only use statuses from the tool enum. "
        . "If the request is unclear, reply in plain text without tools.";
}

$action = parseAssistantPath();
$user = assistantRequireUser($allowedRoles);
$settings = getOpenAISettings();

if ($action === 'status' || ($action === '' && $_SERVER['REQUEST_METHOD'] === 'GET')) {
    assistantJson(200, [
        'success' => true,
        'openai_configured' => $settings['api_key'] !== '',
        'model' => $settings['model'],
        'hint' => $settings['api_key'] === ''
            ? 'Add openai.api_key in api/config.local.php (see config.local.php.example)'
            : null,
    ]);
}

if ($action === 'chat' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($settings['api_key'] === '') {
        assistantJson(503, [
            'success' => false,
            'error' => 'OpenAI API key not configured',
            'code' => 'OPENAI_NOT_CONFIGURED',
            'hint' => 'Copy api/config.local.php.example to api/config.local.php and set openai.api_key to your sk-... key',
        ]);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $message = trim((string)($body['message'] ?? ''));
    if ($message === '') {
        assistantJson(400, ['success' => false, 'error' => 'message is required']);
    }

    $context = is_array($body['context'] ?? null) ? $body['context'] : [];
    $history = is_array($body['history'] ?? null) ? $body['history'] : [];

    $messages = [
        ['role' => 'system', 'content' => buildSystemPrompt($user, $context)],
    ];
    foreach (array_slice($history, -8) as $h) {
        $role = ($h['role'] ?? '') === 'user' ? 'user' : 'assistant';
        $text = trim((string)($h['text'] ?? $h['content'] ?? ''));
        if ($text !== '') {
            $messages[] = ['role' => $role, 'content' => $text];
        }
    }
    $messages[] = ['role' => 'user', 'content' => $message];

    try {
        $response = callOpenAIChat($settings, $messages);
        $choice = $response['choices'][0]['message'] ?? [];
        $reply = trim((string)($choice['content'] ?? ''));
        $intents = [];

        if (!empty($choice['tool_calls']) && is_array($choice['tool_calls'])) {
            foreach ($choice['tool_calls'] as $tc) {
                $fn = $tc['function'] ?? [];
                $fnName = $fn['name'] ?? '';
                $fnArgs = json_decode($fn['arguments'] ?? '{}', true);
                $intent = toolCallToIntent($fnName, $fnArgs, $context['ticket_id'] ?? null);
                if ($intent) {
                    $intents[] = $intent;
                }
            }
            if ($reply === '' && count($intents) > 0) {
                $reply = 'On it — running that for you now.';
            }
        }

        if ($reply === '' && count($intents) === 0) {
            $reply = 'I could not process that. Try rephrasing or say "help".';
        }

        assistantJson(200, [
            'success' => true,
            'mode' => 'openai',
            'reply' => $reply,
            'intents' => $intents,
        ]);
    } catch (Exception $e) {
        error_log('Assistant OpenAI: ' . $e->getMessage());
        assistantJson(502, [
            'success' => false,
            'error' => $e->getMessage(),
            'code' => 'OPENAI_REQUEST_FAILED',
        ]);
    }
}

assistantJson(404, ['success' => false, 'error' => 'Unknown assistant endpoint']);
