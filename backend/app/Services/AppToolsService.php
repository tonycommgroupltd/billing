<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Allowlisted, read-only tools the AI buddy may call.
 * Research scripts run via a sandboxed Python runner (SELECT-only).
 */
class AppToolsService
{
    public function __construct(
        private AccountDiagnosticService $diagnostics,
        private ServerLogService $serverLogs,
        private HotspotIntegrationService $hotspot,
        private AiResearchPythonService $researchPython,
        private OpsCoverageService $opsCoverage,
    ) {
    }

    public function schemas(): array
    {
        return [
            $this->fn('diagnose_account', 'Full customer/service/RADIUS/billing snapshot for a phone or PPPoE username.', [
                'identifier' => $this->str('Phone number or PPPoE username'),
            ], ['identifier']),
            $this->fn('lookup_customer', 'Search customers by phone, name, or id.', [
                'q' => $this->str('Phone, name, or customer id'),
                'limit' => $this->int('Max rows (default 10)', true),
            ], ['q']),
            $this->fn('lookup_service', 'Find PPPoE services by username or customer id. Provide at least one of username or customer_id. Omit unused fields.', [
                'username' => $this->str('PPPoE / mikrotik username', true),
                'customer_id' => $this->int('Customer id', true),
                'limit' => $this->int('Max rows', true),
            ]),
            $this->fn('list_invoices', 'List invoices for a customer or service. Provide customer_id and/or service_id. Omit unused fields.', [
                'customer_id' => $this->int('Customer id', true),
                'service_id' => $this->int('Service id', true),
                'limit' => $this->int('Max rows', true),
            ]),
            $this->fn('list_payments', 'List payments by customer id or M-Pesa/trans id. Omit unused fields.', [
                'customer_id' => $this->int('Customer id', true),
                'trans_id' => $this->str('Transaction / M-Pesa receipt id', true),
                'limit' => $this->int('Max rows', true),
            ]),
            $this->fn('search_mpesa', 'Search M-Pesa records by receipt, phone, or bill reference.', [
                'q' => $this->str('Receipt, phone, or bill reference'),
                'limit' => $this->int('Max rows', true),
            ], ['q']),
            $this->fn('list_sms', 'List outbound SMS. Provide recipient phone and/or customer_id. Omit unused fields — never pass null.', [
                'recipient' => $this->str('Recipient phone number', true),
                'customer_id' => $this->int('Customer id', true),
                'limit' => $this->int('Max rows', true),
            ]),
            $this->fn('lookup_ticket', 'Search support tickets by number, phone, subject text, or status. Omit unused fields.', [
                'q' => $this->str('Ticket number, phone, or subject text', true),
                'status' => $this->str('Ticket status filter', true),
                'limit' => $this->int('Max rows', true),
            ]),
            $this->fn('get_ticket', 'Get one ticket with recent comments. Provide id or number. Omit unused fields.', [
                'id' => $this->int('Ticket id', true),
                'number' => $this->str('Ticket number like #1157', true),
            ]),
            $this->fn('list_routers', 'List ISP routers (no passwords).', [
                'q' => $this->str('Title, host, or NAS IP filter', true),
                'limit' => $this->int('Max rows', true),
            ]),
            $this->fn('radius_sessions', 'RADIUS accounting sessions for a username.', [
                'username' => $this->str('PPPoE username'),
                'open_only' => $this->bool('Only open sessions', true),
                'limit' => $this->int('Max rows', true),
            ], ['username']),
            $this->fn('radius_auth_log', 'Recent RADIUS Access-Accept / Access-Reject for a username.', [
                'username' => $this->str('PPPoE username'),
                'limit' => $this->int('Max rows', true),
            ], ['username']),
            $this->fn('server_logs_catalog', 'List available server log sources.', []),
            $this->fn('server_logs_tail', 'Tail a server log source (laravel, apache_error, radius, syslog, etc).', [
                'source' => $this->str('Log source name from catalog'),
                'lines' => $this->int('1-200 lines', true),
            ], ['source']),
            $this->fn('hotspot_dashboard', 'Hotspot revenue/users summary from Mwananchi.', []),
            $this->fn('hotspot_users', 'Search hotspot users. Omit unused fields.', [
                'search' => $this->str('Phone/username search', true),
                'status' => $this->str('active|expired|disabled', true),
            ]),
            $this->fn('platform_stats', 'Dashboard counts: total/active/blocked/online/prepaid customers, routers, this-month payments & invoices, open tickets. Use for simple totals including prepaid.', [
                'focus' => $this->str('Optional: customers|online|billing|tickets|routers|prepaid', true),
            ]),
            $this->fn('ops_status', 'System status snapshot. Use for radius, sms balance, hotspot, server health, whatsapp, olt, tr069, inventory, vpn, routers, or overview. Always returns available facts + manual_next_steps for gaps.', [
                'focus' => $this->str('radius|sms|hotspot|server|whatsapp|olt|tr069|inventory|vpn|routers|overview'),
            ], ['focus']),
            $this->fn('hotspot_sessions', 'Active hotspot sessions for a Mwananchi router id.', [
                'router_id' => $this->int('Hotspot router id'),
            ], ['router_id']),
            $this->fn('research_glossary', 'Business field meanings + how to write a read-only research Python script (db.query). Call before unexpected research questions.', []),
            $this->fn('run_research_python', 'Create and run a short READ-ONLY Python script on the server. Must set RESULT=... using db.query/db.schema/db.tables. No INSERT/UPDATE/DELETE. Use for hard/unexpected counts and filters.', [
                'code' => $this->str('Full Python script that sets RESULT using db.query(...)'),
                'purpose' => $this->str('One-line why you are running this script', true),
            ], ['code']),
            $this->fn('app_overview', 'Explain what modules/data this TonyComm app covers.', [
                'topic' => $this->str('Optional focus: customers, tickets, sms, logs, radius, hotspot, billing', true),
            ]),
        ];
    }

    public function call(string $name, array $args): array
    {
        $args = $this->cleanArgs(is_array($args) ? $args : []);
        $result = match ($name) {
            'diagnose_account' => $this->diagnostics->diagnose((string) ($args['identifier'] ?? '')),
            'lookup_customer' => $this->lookupCustomer((string) ($args['q'] ?? ''), (int) ($args['limit'] ?? 10)),
            'lookup_service' => $this->lookupService($args),
            'list_invoices' => $this->listInvoices($args),
            'list_payments' => $this->listPayments($args),
            'search_mpesa' => $this->searchMpesa((string) ($args['q'] ?? ''), (int) ($args['limit'] ?? 10)),
            'list_sms' => $this->listSms($args),
            'lookup_ticket' => $this->lookupTicket($args),
            'get_ticket' => $this->getTicket($args),
            'list_routers' => $this->listRouters((string) ($args['q'] ?? ''), (int) ($args['limit'] ?? 20)),
            'radius_sessions' => $this->radiusSessions($args),
            'radius_auth_log' => $this->radiusAuthLog($args),
            'server_logs_catalog' => $this->safe(fn () => $this->serverLogs->catalog()),
            'server_logs_tail' => $this->tailLogs((string) ($args['source'] ?? ''), (int) ($args['lines'] ?? 80)),
            'hotspot_dashboard' => $this->safe(fn () => $this->hotspot->dashboard(auth()->user())),
            'hotspot_users' => $this->safe(fn () => $this->hotspot->users([
                'search' => $args['search'] ?? null,
                'status' => $args['status'] ?? null,
                'page' => 1,
            ], auth()->user())),
            'platform_stats' => $this->platformStats((string) ($args['focus'] ?? '')),
            'ops_status' => $this->opsCoverage->status((string) ($args['focus'] ?? 'overview')),
            'hotspot_sessions' => $this->safe(fn () => $this->hotspot->sessions(
                (int) ($args['router_id'] ?? 0),
                auth()->user()
            )),
            'research_glossary' => $this->researchPython->glossary(),
            'run_research_python' => $this->researchPython->run(
                (string) ($args['code'] ?? ''),
                (string) ($args['purpose'] ?? '')
            ),
            'app_overview' => $this->appOverview((string) ($args['topic'] ?? '')),
            default => ['error' => "Unknown tool: {$name}"],
        };

        return $this->trimResult($result);
    }

    private function trimResult(array $result): array
    {
        // Keep free-tier TPM under control — drop noisy nested bulk.
        if (isset($result['radius']['recent_sessions']) && is_array($result['radius']['recent_sessions'])) {
            $result['radius']['recent_sessions'] = array_slice($result['radius']['recent_sessions'], 0, 8);
        }
        if (isset($result['radius']['recent_authentication']) && is_array($result['radius']['recent_authentication'])) {
            $result['radius']['recent_authentication'] = array_slice($result['radius']['recent_authentication'], 0, 12);
        }
        if (isset($result['billing']['invoices']) && is_array($result['billing']['invoices'])) {
            $result['billing']['invoices'] = array_slice($result['billing']['invoices'], 0, 5);
        }
        if (isset($result['billing']['payments']) && is_array($result['billing']['payments'])) {
            $result['billing']['payments'] = array_slice($result['billing']['payments'], 0, 5);
        }
        if (isset($result['lines']) && is_array($result['lines'])) {
            $result['lines'] = array_slice($result['lines'], -60);
        }

        return $result;
    }

    private function fn(string $name, string $description, array $properties, array $required = []): array
    {
        // Groq/JSON Schema require properties to be an object {}, never a JSON array [].
        $propertiesObject = $properties === [] ? new \stdClass() : $properties;

        return [
            'type' => 'function',
            'function' => [
                'name' => $name,
                'description' => $description,
                'parameters' => [
                    'type' => 'object',
                    'properties' => $propertiesObject,
                    'required' => array_values($required),
                    'additionalProperties' => false,
                ],
            ],
        ];
    }

    private function str(string $description, bool $optional = false): array
    {
        return [
            'type' => $optional ? ['string', 'null'] : 'string',
            'description' => $description . ($optional ? ' Optional — omit instead of null.' : ''),
        ];
    }

    private function int(string $description, bool $optional = false): array
    {
        return [
            'type' => $optional ? ['integer', 'null'] : 'integer',
            'description' => $description . ($optional ? ' Optional — omit instead of null.' : ''),
        ];
    }

    private function bool(string $description, bool $optional = false): array
    {
        return [
            'type' => $optional ? ['boolean', 'null'] : 'boolean',
            'description' => $description . ($optional ? ' Optional — omit instead of null.' : ''),
        ];
    }

    private function cleanArgs(array $args): array
    {
        $clean = [];
        foreach ($args as $key => $value) {
            if ($value === null) {
                continue;
            }
            if (is_string($value) && trim($value) === '') {
                continue;
            }
            $clean[$key] = $value;
        }

        return $clean;
    }

    private function lookupCustomer(string $q, int $limit): array
    {
        return $this->safe(function () use ($q, $limit) {
            if (!Schema::hasTable('customers') || trim($q) === '') {
                return ['customers' => []];
            }
            $limit = max(1, min(25, $limit));
            $digits = preg_replace('/\D+/', '', $q);
            $suffix = strlen($digits) >= 9 ? substr($digits, -9) : null;

            $rows = DB::table('customers')
                ->select(['id', 'name', 'phone_number', 'billing_type', 'category', 'status', 'deleted_at', 'created_at'])
                ->where(function ($query) use ($q, $suffix) {
                    if (ctype_digit($q)) {
                        $query->orWhere('id', (int) $q);
                    }
                    $query->orWhere('name', 'like', '%' . $q . '%')
                        ->orWhere('phone_number', 'like', '%' . $q . '%');
                    if ($suffix) {
                        $query->orWhereRaw(
                            "RIGHT(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', ''), 9) = ?",
                            [$suffix]
                        );
                    }
                })
                ->orderByDesc('id')
                ->limit($limit)
                ->get()
                ->map(fn ($r) => (array) $r)
                ->all();

            return ['customers' => $rows];
        });
    }

    private function lookupService(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!Schema::hasTable('services')) {
                return ['services' => []];
            }
            $username = trim((string) ($args['username'] ?? ''));
            $customerId = (int) ($args['customer_id'] ?? 0);
            $limit = max(1, min(25, (int) ($args['limit'] ?? 10)));
            if ($username === '' && $customerId < 1) {
                return ['error' => 'Provide username or customer_id'];
            }

            $query = DB::table('services as s')
                ->leftJoin('plans as p', 'p.id', '=', 's.plan_id')
                ->leftJoin('routers as r', 'r.id', '=', 's.router_id')
                ->select([
                    's.id', 's.customer_id', 's.mikrotik_name', 's.status', 's.bill_to',
                    's.start_date', 's.end_date', 's.price', 's.router_id', 's.plan_id',
                    'p.title as plan', 'r.title as router', 'r.host as router_host', 'r.nas_ip',
                ])
                ->whereNull('s.deleted_at');

            if ($username !== '') {
                $query->where('s.mikrotik_name', $username);
            }
            if ($customerId > 0) {
                $query->where('s.customer_id', $customerId);
            }

            return [
                'services' => $query->orderByDesc('s.id')->limit($limit)->get()->map(fn ($r) => (array) $r)->all(),
            ];
        });
    }

    private function listInvoices(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!Schema::hasTable('invoices')) {
                return ['invoices' => []];
            }
            $customerId = (int) ($args['customer_id'] ?? 0);
            $serviceId = (int) ($args['service_id'] ?? 0);
            $limit = max(1, min(25, (int) ($args['limit'] ?? 10)));
            if ($customerId < 1 && $serviceId < 1) {
                return ['error' => 'Provide customer_id or service_id'];
            }

            $query = DB::table('invoices as i')
                ->leftJoin('services as s', 's.id', '=', 'i.services_id')
                ->leftJoin('payments as pay', 'pay.invoice_id', '=', 'i.id')
                ->select(['i.id', 'i.services_id', 's.customer_id', 'i.invoice_date', 'i.due_date', 'i.total', 'i.status'])
                ->selectRaw('COALESCE(SUM(pay.sum),0) as paid')
                ->whereNull('i.deleted_at')
                ->groupBy(['i.id', 'i.services_id', 's.customer_id', 'i.invoice_date', 'i.due_date', 'i.total', 'i.status'])
                ->orderByDesc('i.id')
                ->limit($limit);

            if ($serviceId > 0) {
                $query->where('i.services_id', $serviceId);
            }
            if ($customerId > 0) {
                $query->where('s.customer_id', $customerId);
            }

            return ['invoices' => $query->get()->map(fn ($r) => (array) $r)->all()];
        });
    }

    private function listPayments(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!Schema::hasTable('payments')) {
                return ['payments' => []];
            }
            $customerId = (int) ($args['customer_id'] ?? 0);
            $transId = trim((string) ($args['trans_id'] ?? ''));
            $limit = max(1, min(25, (int) ($args['limit'] ?? 10)));
            if ($customerId < 1 && $transId === '') {
                return ['error' => 'Provide customer_id or trans_id'];
            }

            $query = DB::table('payments')
                ->select(['id', 'customer_id', 'invoice_id', 'trans_id', 'payment_type', 'date', 'sum', 'created_at'])
                ->orderByDesc('id')
                ->limit($limit);

            if ($customerId > 0) {
                $query->where('customer_id', $customerId);
            }
            if ($transId !== '') {
                $query->where('trans_id', 'like', '%' . $transId . '%');
            }

            return ['payments' => $query->get()->map(fn ($r) => (array) $r)->all()];
        });
    }

    private function searchMpesa(string $q, int $limit): array
    {
        return $this->safe(function () use ($q, $limit) {
            $limit = max(1, min(25, $limit));
            $q = trim($q);
            if ($q === '') {
                return ['mpesa' => []];
            }

            $out = ['mpesa' => [], 'mpesa_transactions' => []];
            if (Schema::hasTable('mpesa')) {
                $out['mpesa'] = DB::table('mpesa')
                    ->where(function ($query) use ($q) {
                        $query->where('TransID', 'like', "%{$q}%")
                            ->orWhere('BillRefNumber', 'like', "%{$q}%")
                            ->orWhere('MSISDN', 'like', "%{$q}%")
                            ->orWhere('FirstName', 'like', "%{$q}%");
                    })
                    ->orderByDesc('id')
                    ->limit($limit)
                    ->get()
                    ->map(fn ($r) => (array) $r)
                    ->all();
            }
            if (Schema::hasTable('mpesa_transactions')) {
                $out['mpesa_transactions'] = DB::table('mpesa_transactions')
                    ->where(function ($query) use ($q) {
                        $query->where('mpesa_receipt_number', 'like', "%{$q}%")
                            ->orWhere('phone_number', 'like', "%{$q}%")
                            ->orWhere('checkout_request_id', 'like', "%{$q}%");
                    })
                    ->orderByDesc('id')
                    ->limit($limit)
                    ->get()
                    ->map(function ($r) {
                        $row = (array) $r;
                        unset($row['password'], $row['api_password']);
                        return $row;
                    })
                    ->all();
            }

            return $out;
        });
    }

    private function listSms(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!Schema::hasTable('message_details')) {
                return ['sms' => []];
            }
            $recipient = trim((string) ($args['recipient'] ?? ''));
            $customerId = (int) ($args['customer_id'] ?? 0);
            $limit = max(1, min(25, (int) ($args['limit'] ?? 15)));
            if ($recipient === '' && $customerId < 1) {
                return ['error' => 'Provide recipient or customer_id'];
            }

            $query = DB::table('message_details')
                ->select(['id', 'customer_id', 'recipient', 'message', 'status', 'created_at', 'updated_at'])
                ->orderByDesc('id')
                ->limit($limit);

            if ($customerId > 0) {
                $query->where('customer_id', $customerId);
            }
            if ($recipient !== '') {
                $suffix = substr(preg_replace('/\D+/', '', $recipient), -9);
                $query->where(function ($q) use ($recipient, $suffix) {
                    $q->where('recipient', 'like', '%' . $recipient . '%');
                    if (strlen($suffix) === 9) {
                        $q->orWhereRaw(
                            "RIGHT(REPLACE(REPLACE(REPLACE(recipient, ' ', ''), '-', ''), '+', ''), 9) = ?",
                            [$suffix]
                        );
                    }
                });
            }

            return ['sms' => $query->get()->map(fn ($r) => (array) $r)->all()];
        });
    }

    private function lookupTicket(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!$this->ticketsReady()) {
                return ['error' => 'Tickets database is not available from this server'];
            }
            $q = trim((string) ($args['q'] ?? ''));
            $status = trim((string) ($args['status'] ?? ''));
            $limit = max(1, min(25, (int) ($args['limit'] ?? 10)));

            $query = DB::connection('tickets')->table('tickets')
                ->select([
                    'id', 'number', 'subject', 'status', 'type', 'priority',
                    'customer_name', 'customer_phone', 'customer_id', 'assigned_to',
                    'created_at', 'updated_at',
                ])
                ->orderByDesc('id')
                ->limit($limit);

            if ($status !== '') {
                $query->where('status', $status);
            }
            if ($q !== '') {
                $query->where(function ($sub) use ($q) {
                    $sub->where('number', 'like', "%{$q}%")
                        ->orWhere('subject', 'like', "%{$q}%")
                        ->orWhere('customer_name', 'like', "%{$q}%")
                        ->orWhere('customer_phone', 'like', "%{$q}%");
                    $digits = preg_replace('/\D+/', '', $q);
                    if (strlen($digits) >= 9) {
                        $suffix = substr($digits, -9);
                        $sub->orWhereRaw(
                            "RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(customer_phone,''), ' ', ''), '-', ''), '+', ''), 9) = ?",
                            [$suffix]
                        );
                    }
                });
            }

            return ['tickets' => $query->get()->map(fn ($r) => (array) $r)->all()];
        });
    }

    private function getTicket(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!$this->ticketsReady()) {
                return ['error' => 'Tickets database is not available from this server'];
            }
            $id = (int) ($args['id'] ?? 0);
            $number = trim((string) ($args['number'] ?? ''));
            $ticketQuery = DB::connection('tickets')->table('tickets');
            if ($id > 0) {
                $ticket = $ticketQuery->where('id', $id)->first();
            } elseif ($number !== '') {
                $ticket = $ticketQuery->where('number', $number)->orWhere('number', ltrim($number, '#'))->first();
            } else {
                return ['error' => 'Provide id or number'];
            }
            if (!$ticket) {
                return ['ticket' => null];
            }

            $comments = [];
            if (Schema::connection('tickets')->hasTable('ticket_comments')) {
                $comments = DB::connection('tickets')->table('ticket_comments')
                    ->where('ticket_id', $ticket->id)
                    ->orderByDesc('id')
                    ->limit(15)
                    ->get()
                    ->map(fn ($r) => (array) $r)
                    ->all();
            }

            return ['ticket' => (array) $ticket, 'comments' => $comments];
        });
    }

    private function listRouters(string $q, int $limit): array
    {
        return $this->safe(function () use ($q, $limit) {
            if (!Schema::hasTable('routers')) {
                return ['routers' => []];
            }
            $limit = max(1, min(50, $limit));
            $query = DB::table('routers')
                ->select(['id', 'title', 'host', 'nas_ip', 'api_port', 'authorization', 'updated_at'])
                ->whereNull('deleted_at')
                ->orderBy('id')
                ->limit($limit);
            if (trim($q) !== '') {
                $query->where(function ($sub) use ($q) {
                    $sub->where('title', 'like', "%{$q}%")
                        ->orWhere('host', 'like', "%{$q}%")
                        ->orWhere('nas_ip', 'like', "%{$q}%");
                });
            }

            return ['routers' => $query->get()->map(fn ($r) => (array) $r)->all()];
        });
    }

    private function radiusSessions(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!Schema::hasTable('radacct')) {
                return ['sessions' => []];
            }
            $username = trim((string) ($args['username'] ?? ''));
            if ($username === '') {
                return ['error' => 'username required'];
            }
            $limit = max(1, min(30, (int) ($args['limit'] ?? 15)));
            $query = DB::table('radacct')
                ->select([
                    'radacctid', 'username', 'nasipaddress', 'framedipaddress',
                    'acctstarttime', 'acctupdatetime', 'acctstoptime', 'acctsessiontime',
                    'callingstationid', 'acctterminatecause',
                ])
                ->where('username', $username)
                ->orderByDesc('radacctid')
                ->limit($limit);
            if (!empty($args['open_only'])) {
                $query->whereNull('acctstoptime');
            }

            return ['sessions' => $query->get()->map(fn ($r) => (array) $r)->all()];
        });
    }

    private function radiusAuthLog(array $args): array
    {
        return $this->safe(function () use ($args) {
            if (!Schema::hasTable('radpostauth')) {
                return ['auth' => []];
            }
            $username = trim((string) ($args['username'] ?? ''));
            if ($username === '') {
                return ['error' => 'username required'];
            }
            $limit = max(1, min(40, (int) ($args['limit'] ?? 20)));

            return [
                'auth' => DB::table('radpostauth')
                    ->select(['id', 'username', 'reply', 'authdate'])
                    ->where('username', $username)
                    ->orderByDesc('id')
                    ->limit($limit)
                    ->get()
                    ->map(fn ($r) => (array) $r)
                    ->all(),
            ];
        });
    }

    private function tailLogs(string $source, int $lines): array
    {
        return $this->safe(function () use ($source, $lines) {
            $source = trim($source);
            if ($source === '') {
                return ['error' => 'source required'];
            }
            $lines = max(1, min(200, $lines));
            return $this->serverLogs->tail($source, $lines);
        });
    }

    private function platformStats(string $focus = ''): array
    {
        return $this->safe(function () use ($focus) {
            $focus = strtolower(trim($focus));
            $out = [
                'generated_at' => now()->toIso8601String(),
                'definitions' => [
                    'total_customers' => 'Customers with deleted_at NULL',
                    'active_customers' => 'Customers with at least one service status.value = 2 (Active)',
                    'blocked_customers' => 'Customers with a service status.value in 1 or 3 (Disabled/Blocked)',
                    'online_customers' => 'Distinct usernames with a fresh open RADIUS session (dashboard online count)',
                    'prepaid_customers' => 'billing_type.value = 2 on customer OR any service (app prepaid filter)',
                    'prepaid_active_customers' => 'Prepaid customers who also have an active service (status.value = 2)',
                ],
            ];

            if (!Schema::hasTable('customers')) {
                return ['error' => 'customers table missing'];
            }

            $out['total_customers'] = (int) DB::table('customers')->whereNull('deleted_at')->count();

            if (Schema::hasTable('services')) {
                $out['active_customers'] = (int) DB::table('customers as c')
                    ->whereNull('c.deleted_at')
                    ->whereExists(function ($q) {
                        $q->select(DB::raw(1))
                            ->from('services as s')
                            ->whereColumn('s.customer_id', 'c.id')
                            ->whereNull('s.deleted_at')
                            ->where('s.status->value', 2);
                    })
                    ->count();

                $out['blocked_customers'] = (int) DB::table('customers as c')
                    ->whereNull('c.deleted_at')
                    ->whereExists(function ($q) {
                        $q->select(DB::raw(1))
                            ->from('services as s')
                            ->whereColumn('s.customer_id', 'c.id')
                            ->whereNull('s.deleted_at')
                            ->whereIn('s.status->value', [1, 3]);
                    })
                    ->count();

                $out['active_services'] = (int) DB::table('services')
                    ->whereNull('deleted_at')
                    ->where('status->value', 2)
                    ->count();

                // Prepaid = billing_type.value 2 on customer or any service (matches CustomerController filter).
                $out['prepaid_customers'] = (int) DB::table('customers as c')
                    ->whereNull('c.deleted_at')
                    ->where(function ($q) {
                        $q->where('c.billing_type->value', 2)
                            ->orWhereExists(function ($sq) {
                                $sq->select(DB::raw(1))
                                    ->from('services as s')
                                    ->whereColumn('s.customer_id', 'c.id')
                                    ->whereNull('s.deleted_at')
                                    ->where('s.billing_type->value', 2);
                            });
                    })
                    ->count();

                $out['prepaid_active_customers'] = (int) DB::table('customers as c')
                    ->whereNull('c.deleted_at')
                    ->whereExists(function ($q) {
                        $q->select(DB::raw(1))
                            ->from('services as s')
                            ->whereColumn('s.customer_id', 'c.id')
                            ->whereNull('s.deleted_at')
                            ->where('s.status->value', 2)
                            ->where(function ($bq) {
                                $bq->where('s.billing_type->value', 2)
                                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(c.billing_type, '$.value')) = '2'");
                            });
                    })
                    ->count();
            }

            if (Schema::hasTable('radacct') && Schema::hasTable('services')) {
                $ago = now()->subMinutes(7)->toDateTimeString();
                $out['online_customers'] = (int) DB::table('radacct as ra')
                    ->join('services as s', 's.mikrotik_name', '=', 'ra.username')
                    ->whereNull('s.deleted_at')
                    ->where('s.status->value', 2)
                    ->whereNull('ra.acctstoptime')
                    ->where('ra.acctupdatetime', '>=', $ago)
                    ->distinct()
                    ->count('ra.username');
            }

            if (Schema::hasTable('routers')) {
                $out['routers'] = (int) DB::table('routers')->whereNull('deleted_at')->count();
            }

            if (Schema::hasTable('payments')) {
                $out['payments_this_month_count'] = (int) DB::table('payments')
                    ->whereBetween('date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                    ->count();
                $out['payments_this_month_sum'] = (float) DB::table('payments')
                    ->whereBetween('date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                    ->sum('sum');
            }

            if (Schema::hasTable('invoices')) {
                $out['unpaid_invoices'] = (int) DB::table('invoices')
                    ->whereNull('deleted_at')
                    ->where('status->value', 1)
                    ->count();
                $out['paid_invoices_this_month'] = (int) DB::table('invoices')
                    ->whereNull('deleted_at')
                    ->where('status->value', 2)
                    ->whereBetween('invoice_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                    ->count();
            }

            if ($this->ticketsReady()) {
                $openStatuses = ['new', 'open', 'in_progress', 'waiting_on_agent', 'waiting_on_customer', 'assigned'];
                $out['tickets_open'] = (int) DB::connection('tickets')->table('tickets')
                    ->whereNull('deleted_at')
                    ->whereIn('status', $openStatuses)
                    ->count();
                $out['tickets_total'] = (int) DB::connection('tickets')->table('tickets')
                    ->whereNull('deleted_at')
                    ->count();
            }

            if ($focus === 'customers' || $focus === 'online' || $focus === 'prepaid') {
                return array_intersect_key($out, array_flip([
                    'generated_at', 'definitions', 'total_customers', 'active_customers',
                    'blocked_customers', 'active_services', 'online_customers',
                    'prepaid_customers', 'prepaid_active_customers',
                ]));
            }
            if ($focus === 'billing') {
                return array_intersect_key($out, array_flip([
                    'generated_at', 'payments_this_month_count', 'payments_this_month_sum',
                    'unpaid_invoices', 'paid_invoices_this_month',
                ]));
            }
            if ($focus === 'tickets') {
                return array_intersect_key($out, array_flip([
                    'generated_at', 'tickets_open', 'tickets_total',
                ]));
            }
            if ($focus === 'routers') {
                return array_intersect_key($out, array_flip(['generated_at', 'routers']));
            }

            return $out;
        });
    }

    private function appOverview(string $topic): array
    {
        $map = [
            'customers' => 'Customers, services/PPPoE usernames, plans, assigned routers, online via RADIUS.',
            'billing' => 'Invoices, payments, M-Pesa C2B records, credits/balances.',
            'tickets' => 'Support tickets in the tickets DB: number, status, assignee, comments, customer phone.',
            'sms' => 'Outbound SMS in message_details (recipient, status, body).',
            'radius' => 'radcheck/radreply attributes, radacct sessions, radpostauth accept/reject.',
            'logs' => 'Server logs: laravel, apache, radius, syslog via server_logs_* tools.',
            'hotspot' => 'Mwananchi hotspot users, sessions, dashboard revenue via hotspot_* tools.',
            'routers' => 'MikroTik routers inventory (host/nas_ip) without API passwords.',
        ];
        $topic = strtolower(trim($topic));
        if ($topic !== '' && isset($map[$topic])) {
            return ['topic' => $topic, 'summary' => $map[$topic]];
        }

        return [
            'summary' => 'TonyComm ISP app covers customers/services, billing/M-Pesa, tickets, SMS/WhatsApp, RADIUS, routers, hotspot, and server logs.',
            'topics' => $map,
        ];
    }

    private function ticketsReady(): bool
    {
        try {
            return Schema::connection('tickets')->hasTable('tickets');
        } catch (Throwable $e) {
            return false;
        }
    }

    private function safe(callable $callback): array
    {
        try {
            $result = $callback();
            return is_array($result) ? $result : ['result' => $result];
        } catch (Throwable $e) {
            report($e);
            return ['error' => $e->getMessage()];
        }
    }
}
