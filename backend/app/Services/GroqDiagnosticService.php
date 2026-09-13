<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class GroqDiagnosticService
{
    private const HISTORY_TURNS = 4;
    private const HISTORY_CHARS = 900;
    private const TOOL_RESULT_CHARS = 4500;
    private const MAX_ITERATIONS = 8;
    private const RATE_LIMIT_RETRIES = 3;
    private const TOOL_VALIDATION_RETRIES = 2;

    public function __construct(private AppToolsService $tools)
    {
    }

    /**
     * @param  array<int, array{role:string,content:string}>  $history
     * @return array{answer:string,tools_used:array<int,string>,iterations:int,trace:array<int,array<string,mixed>>}
     */
    public function chat(string $question, array $history = []): array
    {
        $apiKey = (string) config('services.groq.key');
        if ($apiKey === '') {
            throw new RuntimeException('Groq is not configured. Set GROQ_API_KEY on the server.', 503);
        }

        $baseUrl = rtrim((string) config('services.groq.base_url'), '/');
        $model = (string) config('services.groq.model');
        $timeout = max(15, (int) config('services.groq.timeout', 60));
        $tools = $this->tools->schemas();
        $allowedToolNames = $this->allowedToolNames($tools);
        $toolsUsed = [];
        $trace = [];
        $toolValidationRetries = 0;

        $messages = [
            ['role' => 'system', 'content' => $this->systemPrompt()],
        ];

        foreach (array_slice($history, -self::HISTORY_TURNS) as $turn) {
            $role = ($turn['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $content = trim((string) ($turn['content'] ?? ''));
            if ($content === '') {
                continue;
            }
            $messages[] = [
                'role' => $role,
                'content' => mb_substr($content, 0, self::HISTORY_CHARS),
            ];
        }

        $messages[] = [
            'role' => 'user',
            'content' => mb_substr(trim($question), 0, 1500),
        ];

        $trace[] = [
            'step' => 1,
            'type' => 'plan',
            'title' => 'Received question',
            'detail' => mb_substr(trim($question), 0, 300),
            'at' => now()->toIso8601String(),
        ];

        for ($iteration = 1; $iteration <= self::MAX_ITERATIONS; $iteration++) {
            $payload = [
                'model' => $model,
                'temperature' => 0.4,
                'max_tokens' => 700,
                'messages' => $this->compactMessages($messages),
                'tools' => $tools,
                'tool_choice' => $iteration === self::MAX_ITERATIONS ? 'none' : 'auto',
            ];

            $trace[] = [
                'step' => count($trace) + 1,
                'type' => 'thinking',
                'title' => "Model thinking (round {$iteration})",
                'detail' => 'Choosing tools or drafting the answer…',
                'at' => now()->toIso8601String(),
            ];

            try {
                $response = $this->requestWithRateLimitRetry($baseUrl, $apiKey, $timeout, $payload);
            } catch (RuntimeException $exception) {
                if (
                    $this->isToolValidationError($exception->getMessage())
                    && $toolValidationRetries < self::TOOL_VALIDATION_RETRIES
                ) {
                    $toolValidationRetries++;
                    $hint = $this->toolValidationHint($exception->getMessage(), $allowedToolNames);
                    Log::warning('AI buddy tool-name validation failed; retrying', [
                        'attempt' => $toolValidationRetries,
                        'message' => mb_substr($exception->getMessage(), 0, 300),
                    ]);
                    $trace[] = [
                        'step' => count($trace) + 1,
                        'type' => 'thinking',
                        'title' => 'Recovering from bad tool name',
                        'detail' => $hint,
                        'at' => now()->toIso8601String(),
                    ];
                    $messages[] = [
                        'role' => 'user',
                        'content' => $hint,
                    ];
                    continue;
                }

                throw $exception;
            }

            $choice = $response->json('choices.0.message') ?? [];
            $toolCalls = $choice['tool_calls'] ?? [];

            if (!empty($toolCalls) && is_array($toolCalls)) {
                $toolCalls = $this->normalizeToolCalls($toolCalls, $allowedToolNames);
                // Cap parallel tool calls to keep TPM under free-tier limits.
                $toolCalls = array_slice($toolCalls, 0, 2);
                // Research scripts are heavy — run one at a time.
                $hasResearch = false;
                foreach ($toolCalls as $tc) {
                    if (($tc['function']['name'] ?? '') === 'run_research_python') {
                        $hasResearch = true;
                        break;
                    }
                }
                if ($hasResearch) {
                    $toolCalls = array_values(array_filter(
                        $toolCalls,
                        static fn ($tc) => ($tc['function']['name'] ?? '') === 'run_research_python'
                    ));
                    $toolCalls = array_slice($toolCalls, 0, 1);
                }

                if ($toolCalls === []) {
                    $messages[] = [
                        'role' => 'user',
                        'content' => 'Your previous tool call used an invalid tool name. '
                            . 'Call ONLY one of these exact names: ' . implode(', ', $allowedToolNames) . '. '
                            . 'Never append <|channel|> or commentary tokens to tool names.',
                    ];
                    continue;
                }

                $messages[] = [
                    'role' => 'assistant',
                    'content' => $choice['content'] ?? null,
                    'tool_calls' => $toolCalls,
                ];

                foreach ($toolCalls as $toolCall) {
                    $name = (string) ($toolCall['function']['name'] ?? '');
                    $rawArgs = (string) ($toolCall['function']['arguments'] ?? '{}');
                    $args = json_decode($rawArgs, true);
                    if (!is_array($args)) {
                        $args = [];
                    }
                    $args = array_filter(
                        $args,
                        static fn ($value) => $value !== null && $value !== ''
                    );
                    $id = (string) ($toolCall['id'] ?? ('tool_' . count($toolsUsed)));
                    $toolsUsed[] = $name;

                    Log::info('AI buddy tool call', [
                        'user_id' => auth()->id(),
                        'tool' => $name,
                        'args_keys' => array_keys($args),
                    ]);

                    $started = microtime(true);
                    $result = $name === ''
                        ? ['error' => 'Missing tool name']
                        : $this->tools->call($name, $args);
                    $elapsedMs = (int) round((microtime(true) - $started) * 1000);

                    $trace[] = $this->traceToolStep(count($trace) + 1, $name, $args, $result, $elapsedMs);

                    $messages[] = [
                        'role' => 'tool',
                        'tool_call_id' => $id,
                        'content' => $this->encodeToolResult($result),
                    ];
                }

                continue;
            }

            $answer = trim((string) ($choice['content'] ?? ''));
            if ($answer === '') {
                throw new RuntimeException('Groq returned an empty response.', 502);
            }

            $trace[] = [
                'step' => count($trace) + 1,
                'type' => 'answer',
                'title' => 'Final answer ready',
                'detail' => mb_substr($answer, 0, 400),
                'at' => now()->toIso8601String(),
            ];

            return [
                'answer' => $answer,
                'tools_used' => array_values(array_unique(array_filter($toolsUsed))),
                'iterations' => $iteration,
                'trace' => $trace,
            ];
        }

        throw new RuntimeException('AI buddy stopped before producing an answer.', 502);
    }

    /**
     * @param  array<string, mixed>  $args
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function traceToolStep(int $step, string $name, array $args, array $result, int $elapsedMs): array
    {
        $entry = [
            'step' => $step,
            'type' => 'tool',
            'title' => $name,
            'tool' => $name,
            'elapsed_ms' => $elapsedMs,
            'ok' => !isset($result['error']) && (($result['ok'] ?? true) !== false),
            'at' => now()->toIso8601String(),
        ];

        if ($name === 'run_research_python') {
            $entry['title'] = 'Python research';
            $entry['purpose'] = mb_substr((string) ($args['purpose'] ?? ''), 0, 240);
            $entry['python'] = mb_substr((string) ($args['code'] ?? ''), 0, 6000);
            $entry['output'] = [
                'ok' => (bool) ($result['ok'] ?? false),
                'result' => $result['result'] ?? null,
                'error' => isset($result['error']) ? mb_substr((string) $result['error'], 0, 800) : null,
                'prints' => array_slice($result['prints'] ?? [], 0, 20),
            ];
            $entry['detail'] = $entry['ok']
                ? 'Script finished — RESULT captured'
                : ('Script failed: ' . mb_substr((string) ($result['error'] ?? 'unknown'), 0, 200));

            return $entry;
        }

        if ($name === 'research_glossary') {
            $entry['title'] = 'Loaded research glossary';
            $entry['detail'] = 'Business field meanings + script rules';
            $entry['output'] = [
                'definitions' => array_slice($result['definitions'] ?? [], 0, 12, true),
            ];

            return $entry;
        }

        $safeArgs = $args;
        unset($safeArgs['code']);
        $entry['args'] = $safeArgs;
        $entry['detail'] = 'Tool returned live data';
        $entry['output'] = $this->compactTraceOutput($result);

        return $entry;
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function compactTraceOutput(array $result): array
    {
        $json = json_encode($result, JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            return ['error' => 'encode_failed'];
        }
        if (mb_strlen($json) <= 2500) {
            return $result;
        }

        return [
            'summary' => mb_substr($json, 0, 2500) . '…[truncated]',
            'keys' => array_keys($result),
        ];
    }

    /**
     * @param  array<int, array{role:string,content:string}>  $history
     */
    public function analyze(string $question, array $facts = [], array $history = []): string
    {
        if ($facts !== []) {
            $history[] = [
                'role' => 'user',
                'content' => 'Private facts already gathered (use if relevant): '
                    . mb_substr(json_encode($facts, JSON_UNESCAPED_SLASHES) ?: '', 0, self::TOOL_RESULT_CHARS),
            ];
        }

        return $this->chat($question, $history)['answer'];
    }

    private function requestWithRateLimitRetry(
        string $baseUrl,
        string $apiKey,
        int $timeout,
        array $payload
    ): Response {
        $attempt = 0;
        while (true) {
            $attempt++;
            $response = Http::asJson()
                ->acceptJson()
                ->withToken($apiKey)
                ->timeout($timeout)
                ->post($baseUrl . '/chat/completions', $payload);

            if ($response->successful()) {
                return $response;
            }

            $message = (string) ($response->json('error.message') ?: $response->body() ?: 'Groq request failed');
            $isRateLimit = $response->status() === 429
                || stripos($message, 'rate limit') !== false
                || stripos($message, 'tokens per minute') !== false;

            if ($isRateLimit && $attempt <= self::RATE_LIMIT_RETRIES) {
                $waitSeconds = $this->parseRetryWaitSeconds($message);
                Log::warning('AI buddy rate-limited; retrying', [
                    'attempt' => $attempt,
                    'wait_seconds' => $waitSeconds,
                ]);
                usleep((int) round($waitSeconds * 1_000_000));
                continue;
            }

            $code = $isRateLimit ? 429 : ($response->status() ?: 502);
            if ($isRateLimit) {
                $message = 'Groq free tier is busy right now (token rate limit). Wait a few seconds and try again, '
                    . 'or upgrade the Groq Dev Tier for higher limits.';
            } elseif ($this->isToolValidationError($message)) {
                // Keep original message so chat() can recover/retry with a correction hint.
                $code = 400;
            }

            throw new RuntimeException($message, $code);
        }
    }

    private function isToolValidationError(string $message): bool
    {
        return stripos($message, 'tool call validation failed') !== false
            || stripos($message, 'tool_use_failed') !== false
            || stripos($message, 'which was not in request.tools') !== false;
    }

    /**
     * @param  array<int, string>  $allowedToolNames
     */
    private function toolValidationHint(string $message, array $allowedToolNames): string
    {
        $bad = null;
        if (preg_match("/attempted to call tool\s+'([^']+)'/i", $message, $match)) {
            $bad = $match[1];
        }

        $fixed = $bad ? $this->sanitizeToolName($bad, $allowedToolNames) : null;
        $names = implode(', ', $allowedToolNames);

        if ($bad && $fixed && $fixed !== $bad && in_array($fixed, $allowedToolNames, true)) {
            return "Your last tool call used invalid name '{$bad}'. "
                . "That should be exactly '{$fixed}'. "
                . "Call tools with EXACT names only ({$names}). "
                . 'Never append <|channel|>, commentary, or other tokens to tool names. Retry now.';
        }

        return 'Tool call validation failed'
            . ($bad ? " for '{$bad}'" : '')
            . ". Use EXACT tool names only: {$names}. "
            . 'Never append <|channel|> or commentary tokens. Retry with a valid tool.';
    }

    /**
     * @param  array<int, array<string, mixed>>  $tools
     * @return array<int, string>
     */
    private function allowedToolNames(array $tools): array
    {
        $names = [];
        foreach ($tools as $tool) {
            $name = (string) ($tool['function']['name'] ?? '');
            if ($name !== '') {
                $names[] = $name;
            }
        }

        return $names;
    }

    /**
     * Fix Groq/gpt-oss quirks: radius_sessions<|channel|>commentary, name,{args}, etc.
     *
     * @param  array<int, array<string, mixed>>  $toolCalls
     * @param  array<int, string>  $allowedToolNames
     * @return array<int, array<string, mixed>>
     */
    private function normalizeToolCalls(array $toolCalls, array $allowedToolNames): array
    {
        $normalized = [];
        foreach ($toolCalls as $toolCall) {
            if (!is_array($toolCall)) {
                continue;
            }
            $rawName = (string) ($toolCall['function']['name'] ?? '');
            $rawArgs = (string) ($toolCall['function']['arguments'] ?? '{}');

            // Some models embed JSON args inside the function name.
            if (str_contains($rawName, ',{')) {
                [$maybeName, $inlineArgs] = explode(',', $rawName, 2);
                if (json_decode($inlineArgs, true) !== null) {
                    $rawName = $maybeName;
                    if (trim($rawArgs) === '' || $rawArgs === '{}') {
                        $rawArgs = $inlineArgs;
                    }
                }
            }

            $name = $this->sanitizeToolName($rawName, $allowedToolNames);
            if ($name === '' || !in_array($name, $allowedToolNames, true)) {
                Log::warning('AI buddy dropped unknown tool call', [
                    'raw' => mb_substr($rawName, 0, 200),
                    'sanitized' => $name,
                ]);
                continue;
            }

            $toolCall['function']['name'] = $name;
            $toolCall['function']['arguments'] = $rawArgs !== '' ? $rawArgs : '{}';
            $normalized[] = $toolCall;
        }

        return $normalized;
    }

    /**
     * @param  array<int, string>  $allowedToolNames
     */
    private function sanitizeToolName(string $name, array $allowedToolNames): string
    {
        $name = trim($name);
        if ($name === '') {
            return '';
        }

        // Strip gpt-oss / harmony channel markers: name<|channel|>commentary
        $name = preg_replace('/<\|[^|>]*\|>.*$/u', '', $name) ?? $name;
        $name = preg_replace('/<[^>]+>/', '', $name) ?? $name;
        $name = trim($name);

        if (in_array($name, $allowedToolNames, true)) {
            return $name;
        }

        // Prefix match against allowlist (longest first).
        usort($allowedToolNames, static fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));
        foreach ($allowedToolNames as $allowed) {
            if (str_starts_with($name, $allowed) || preg_match('/\b' . preg_quote($allowed, '/') . '\b/', $name)) {
                return $allowed;
            }
        }

        // Keep only safe tool-name characters and try again.
        $cleaned = preg_replace('/[^a-zA-Z0-9_]/', '', $name) ?? '';
        if (in_array($cleaned, $allowedToolNames, true)) {
            return $cleaned;
        }

        return $cleaned;
    }

    private function parseRetryWaitSeconds(string $message): float
    {
        if (preg_match('/try again in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i', $message, $match)) {
            return min(15.0, max(1.0, (float) $match[1] + 0.4));
        }

        return 4.0;
    }

    /**
     * Keep conversation under free-tier TPM by shrinking older tool payloads.
     *
     * @param  array<int, array<string, mixed>>  $messages
     * @return array<int, array<string, mixed>>
     */
    private function compactMessages(array $messages): array
    {
        $toolIndexes = [];
        foreach ($messages as $index => $message) {
            if (($message['role'] ?? '') === 'tool') {
                $toolIndexes[] = $index;
            }
        }

        // Keep only the latest 3 tool payloads in full; summarize older ones.
        $keepFull = array_slice($toolIndexes, -3);
        foreach ($toolIndexes as $index) {
            if (in_array($index, $keepFull, true)) {
                continue;
            }
            $content = (string) ($messages[$index]['content'] ?? '');
            $messages[$index]['content'] = mb_substr($content, 0, 400) . '…[truncated]';
        }

        return $messages;
    }

    private function encodeToolResult(array $result): string
    {
        $json = json_encode($result, JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            return '{"error":"encode_failed"}';
        }

        if (mb_strlen($json) <= self::TOOL_RESULT_CHARS) {
            return $json;
        }

        return mb_substr($json, 0, self::TOOL_RESULT_CHARS) . '…[truncated]';
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
You are TonyComm's staff buddy / in-app research agent for this ISP app (customers, tickets, SMS, billing, RADIUS, routers, hotspot, OLT, TR-069, WhatsApp, inventory, VPN, logs).

Talk naturally. Answer the asked question only. Never invent numbers.
ALWAYS prefer a partial useful answer over silence:
- Report every fact you successfully retrieved.
- If something is missing/unavailable, say so briefly and include manual_next_steps / where staff can check the rest in the UI or Advanta/SSH.
- Do not refuse just because one subsystem failed.

Routing:
- System status (radius / sms balance / hotspot / server / whatsapp / olt / tr069 / inventory / vpn / routers) → ops_status with that focus.
- Simple dashboard totals (including prepaid) → platform_stats.
- Unexpected filtered research → research_glossary then run_research_python (read-only).
- Account issues → diagnose_account. Tickets → lookup_ticket/get_ticket. SMS messages → list_sms. Logs → server_logs_tail. Hotspot users → hotspot_*.
Prepaid = billing_type.value 2.
Script rules: SELECT/SHOW/DESCRIBE/EXPLAIN/WITH only; set RESULT=...
Omit unused optional tool args (never pass null). Never reveal passwords/secrets/SQL credentials. Keep replies under 220 words.
CRITICAL: tool function names must match EXACTLY (e.g. ops_status, radius_sessions). Never append <|channel|>, commentary, XML, or any extra tokens to tool names.
PROMPT;
    }
}
