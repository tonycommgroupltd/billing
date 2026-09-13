<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Service;
use App\Models\ServiceChangeLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AdministrationHubController extends Controller
{
    private function storePath(string $name): string
    {
        $dir = storage_path('app/admin-hub');
        if (!File::isDirectory($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        return $dir . DIRECTORY_SEPARATOR . $name . '.json';
    }

    private function readStore(string $name, array $default = []): array
    {
        $path = $this->storePath($name);
        if (!File::exists($path)) {
            return $default;
        }

        $decoded = json_decode(File::get($path), true);

        return is_array($decoded) ? $decoded : $default;
    }

    private function writeStore(string $name, array $data): void
    {
        File::put($this->storePath($name), json_encode(array_values($data), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    public function partners()
    {
        return response()->json(['data' => $this->readStore('partners', [])]);
    }

    public function storePartner(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'contact' => 'nullable|string|max:120',
            'phone' => 'nullable|string|max:40',
            'email' => 'nullable|email|max:120',
            'notes' => 'nullable|string|max:500',
        ]);

        $items = $this->readStore('partners', []);
        $item = array_merge($data, [
            'id' => (string) Str::uuid(),
            'created_at' => now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
        ]);
        $items[] = $item;
        $this->writeStore('partners', $items);

        return response()->json(['data' => $item], 201);
    }

    public function updatePartner(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'contact' => 'nullable|string|max:120',
            'phone' => 'nullable|string|max:40',
            'email' => 'nullable|email|max:120',
            'notes' => 'nullable|string|max:500',
        ]);

        $items = $this->readStore('partners', []);
        $found = false;
        foreach ($items as &$item) {
            if (($item['id'] ?? '') === $id) {
                $item = array_merge($item, $data, ['updated_at' => now()->toIso8601String()]);
                $found = true;
                break;
            }
        }
        unset($item);

        if (!$found) {
            return response()->json(['message' => 'Partner not found'], 404);
        }

        $this->writeStore('partners', $items);

        return response()->json(['data' => collect($items)->firstWhere('id', $id)]);
    }

    public function destroyPartner(string $id)
    {
        $items = $this->readStore('partners', []);
        $filtered = array_values(array_filter($items, fn ($item) => ($item['id'] ?? '') !== $id));
        if (count($filtered) === count($items)) {
            return response()->json(['message' => 'Partner not found'], 404);
        }
        $this->writeStore('partners', $filtered);

        return response()->json(['message' => 'Deleted']);
    }

    public function locations()
    {
        return response()->json(['data' => $this->readStore('locations', [])]);
    }

    public function storeLocation(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'city' => 'nullable|string|max:120',
            'address' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:500',
        ]);

        $items = $this->readStore('locations', []);
        $item = array_merge($data, [
            'id' => (string) Str::uuid(),
            'created_at' => now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
        ]);
        $items[] = $item;
        $this->writeStore('locations', $items);

        return response()->json(['data' => $item], 201);
    }

    public function updateLocation(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'city' => 'nullable|string|max:120',
            'address' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:500',
        ]);

        $items = $this->readStore('locations', []);
        $found = false;
        foreach ($items as &$item) {
            if (($item['id'] ?? '') === $id) {
                $item = array_merge($item, $data, ['updated_at' => now()->toIso8601String()]);
                $found = true;
                break;
            }
        }
        unset($item);

        if (!$found) {
            return response()->json(['message' => 'Location not found'], 404);
        }

        $this->writeStore('locations', $items);

        return response()->json(['data' => collect($items)->firstWhere('id', $id)]);
    }

    public function destroyLocation(string $id)
    {
        $items = $this->readStore('locations', []);
        $filtered = array_values(array_filter($items, fn ($item) => ($item['id'] ?? '') !== $id));
        if (count($filtered) === count($items)) {
            return response()->json(['message' => 'Location not found'], 404);
        }
        $this->writeStore('locations', $filtered);

        return response()->json(['message' => 'Deleted']);
    }

    public function apiKeys()
    {
        $mask = function (?string $value): array {
            $value = trim((string) $value);
            if ($value === '') {
                return ['configured' => false, 'preview' => null];
            }
            $len = strlen($value);
            $preview = $len <= 8
                ? str_repeat('*', $len)
                : substr($value, 0, 4) . str_repeat('*', max(4, $len - 8)) . substr($value, -4);

            return ['configured' => true, 'preview' => $preview];
        };

        $keys = [
            [
                'id' => 'sms_advanta',
                'name' => 'Advanta SMS API key',
                'purpose' => 'Outbound SMS (welcome, billing, OTP)',
                ...$mask(config('sms.apikey') ?: config('services.advanta.api_key')),
            ],
            [
                'id' => 'sms_partner',
                'name' => 'Advanta partner ID',
                'purpose' => 'SMS account partner identifier',
                ...$mask((string) config('sms.partnerID')),
            ],
            [
                'id' => 'olt',
                'name' => 'OLT API key',
                'purpose' => 'OLT monitoring proxy',
                ...$mask((string) config('ops.olt_api_key')),
            ],
            [
                'id' => 'tr069',
                'name' => 'TR-069 API key',
                'purpose' => 'ACS / CPE management',
                ...$mask((string) config('ops.tr069_api_key')),
            ],
            [
                'id' => 'vpn',
                'name' => 'VPN API key',
                'purpose' => 'Standby VPN management',
                ...$mask((string) config('ops.vpn_api_key')),
            ],
            [
                'id' => 'groq',
                'name' => 'Groq API key',
                'purpose' => 'AI Buddy / diagnostics',
                ...$mask((string) env('GROQ_API_KEY', config('services.groq.key'))),
            ],
            [
                'id' => 'jwt',
                'name' => 'JWT secret',
                'purpose' => 'API authentication tokens',
                ...$mask((string) config('jwt.secret')),
            ],
        ];

        return response()->json(['data' => $keys]);
    }

    public function license()
    {
        $haMode = null;
        try {
            if (Schema::hasTable('emergency_bypass_settings') || File::exists(storage_path('app/emergency-bypass.json'))) {
                $haMode = 'available';
            }
        } catch (\Throwable $e) {
            $haMode = null;
        }

        return response()->json([
            'data' => [
                'product' => config('app.name', 'Tonycomm Group LTD'),
                'site_title' => env('APP_NAME', 'Tonycomm Group LTD'),
                'environment' => config('app.env'),
                'app_url' => config('app.url'),
                'php_version' => PHP_VERSION,
                'laravel_version' => app()->version(),
                'timezone' => config('app.timezone'),
                'licensed' => true,
                'license_type' => 'Internal ISP platform',
                'high_availability' => $haMode,
                'notes' => 'This platform is operated by Tonycomm Group LTD. There is no third-party Splynx license binding.',
            ],
        ]);
    }

    public function report(Request $request, string $type)
    {
        $limit = min(5000, max(50, (int) $request->query('limit', 500)));

        return match ($type) {
            'services-export' => $this->reportServicesExport($limit),
            'finance-report' => $this->reportFinanceByPlan(),
            'usage-report' => $this->reportUsage($limit),
            'refill-card-statistics' => response()->json([
                'title' => 'Refill cards statistics',
                'description' => 'Refill-card vouchers are not enabled on this platform.',
                'columns' => ['metric', 'value'],
                'rows' => [
                    ['metric' => 'Module', 'value' => 'Not configured'],
                    ['metric' => 'Cards issued', 'value' => 0],
                    ['metric' => 'Cards redeemed', 'value' => 0],
                ],
            ]),
            'blocked-report' => $this->reportBlocked($limit),
            'finance-logs' => $this->reportFinanceLogs($limit),
            'statements-main' => $this->reportStatements($limit),
            'tax' => $this->reportTax(),
            'invoice-report' => $this->reportInvoices($limit),
            'new-services-report' => $this->reportNewServices($limit),
            'custom-prices-and-discount-report' => $this->reportCustomPrices($limit),
            'transactions-categories' => $this->reportTransactionCategories(),
            'customer-contracts' => $this->reportContracts($limit),
            'changes' => $this->reportChanges($limit),
            'pending' => $this->reportPending($limit),
            default => response()->json(['message' => 'Unknown report type'], 404),
        };
    }

    private function customerName(?int $customerId): string
    {
        if (!$customerId) {
            return '';
        }
        static $cache = [];
        if (!array_key_exists($customerId, $cache)) {
            $cache[$customerId] = (string) (Customer::query()->where('id', $customerId)->value('name') ?? '');
        }

        return $cache[$customerId];
    }

    private function reportServicesExport(int $limit)
    {
        $rows = Service::query()
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(function (Service $s) {
                return [
                    'service_id' => $s->id,
                    'customer_id' => $s->customer_id,
                    'customer' => $this->customerName($s->customer_id),
                    'plan' => $s->plan_title,
                    'price' => $s->price,
                    'status' => is_array($s->status) ? ($s->status['label'] ?? $s->status['value'] ?? '') : $s->status,
                    'router_id' => $s->router_id,
                    'start_date' => $s->start_date,
                    'end_date' => $s->end_date,
                    'mikrotik_name' => $s->mikrotik_name,
                ];
            })
            ->values();

        return response()->json([
            'title' => 'Services export',
            'description' => 'All internet services (latest first). Export with CSV/Excel on this page.',
            'columns' => ['service_id', 'customer_id', 'customer', 'plan', 'price', 'status', 'router_id', 'start_date', 'end_date', 'mikrotik_name'],
            'rows' => $rows,
        ]);
    }

    private function reportFinanceByPlan()
    {
        $plans = Plan::query()->get()->keyBy('id');
        $services = Service::query()->select('id', 'plan_id', 'price', 'customer_id', 'status')->get();

        $byPlan = [];
        foreach ($services as $service) {
            $planId = (int) $service->plan_id;
            if (!isset($byPlan[$planId])) {
                $byPlan[$planId] = [
                    'plan_id' => $planId,
                    'plan' => $plans[$planId]->title ?? ('Plan #' . $planId),
                    'services' => 0,
                    'active_services' => 0,
                    'monthly_value' => 0,
                ];
            }
            $byPlan[$planId]['services']++;
            $statusVal = is_array($service->status) ? (int) ($service->status['value'] ?? 0) : 0;
            if ($statusVal === 2) {
                $byPlan[$planId]['active_services']++;
                $byPlan[$planId]['monthly_value'] += (float) $service->price;
            }
        }

        $rows = array_values($byPlan);
        usort($rows, fn ($a, $b) => $b['monthly_value'] <=> $a['monthly_value']);

        return response()->json([
            'title' => 'Financial report per plan',
            'description' => 'Active service count and estimated recurring value by tariff plan.',
            'columns' => ['plan_id', 'plan', 'services', 'active_services', 'monthly_value'],
            'rows' => $rows,
        ]);
    }

    private function reportUsage(int $limit)
    {
        $rows = [];
        if (Schema::hasTable('radacct')) {
            $agg = DB::table('radacct')
                ->selectRaw('username, COUNT(*) as sessions, SUM(COALESCE(acctinputoctets,0)+COALESCE(acctoutputoctets,0)) as bytes, MAX(acctstarttime) as last_start')
                ->groupBy('username')
                ->orderByDesc('bytes')
                ->limit($limit)
                ->get();

            $rows = $agg->map(fn ($r) => [
                'username' => $r->username,
                'sessions' => (int) $r->sessions,
                'bytes' => (int) $r->bytes,
                'mb' => round(((int) $r->bytes) / 1048576, 2),
                'last_start' => $r->last_start,
            ])->values();
        }

        $count = is_countable($rows) ? count($rows) : 0;

        return response()->json([
            'title' => 'Customer internet usage',
            'description' => $count
                ? 'Aggregated RADIUS accounting usage by username.'
                : 'No RADIUS accounting table available yet.',
            'columns' => ['username', 'sessions', 'bytes', 'mb', 'last_start'],
            'rows' => $rows,
        ]);
    }

    private function reportBlocked(int $limit)
    {
        $rows = Service::query()
            ->where(function ($q) {
                $q->where('status->value', 1)->orWhere('status->value', 3);
            })
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(function (Service $s) {
                $statusVal = is_array($s->status) ? (int) ($s->status['value'] ?? 0) : 0;

                return [
                    'service_id' => $s->id,
                    'customer_id' => $s->customer_id,
                    'customer' => $this->customerName($s->customer_id),
                    'plan' => $s->plan_title,
                    'status' => $statusVal === 1 ? 'Disabled' : ($statusVal === 3 ? 'Expired' : 'Blocked'),
                    'end_date' => $s->end_date,
                    'mikrotik_name' => $s->mikrotik_name,
                ];
            })
            ->values();

        return response()->json([
            'title' => 'Blocked customers report',
            'description' => 'Services that are disabled or expired.',
            'columns' => ['service_id', 'customer_id', 'customer', 'plan', 'status', 'end_date', 'mikrotik_name'],
            'rows' => $rows,
        ]);
    }

    private function reportFinanceLogs(int $limit)
    {
        $rows = Payment::query()
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (Payment $p) => [
                'id' => $p->id,
                'customer_id' => $p->customer_id,
                'customer' => $this->customerName($p->customer_id),
                'trans_id' => $p->trans_id,
                'payment_type' => $p->payment_type,
                'date' => $p->date,
                'sum' => $p->sum,
                'invoice_id' => $p->invoice_id,
            ])
            ->values();

        return response()->json([
            'title' => 'Finance logs',
            'description' => 'Payment ledger entries (latest first).',
            'columns' => ['id', 'customer_id', 'customer', 'trans_id', 'payment_type', 'date', 'sum', 'invoice_id'],
            'rows' => $rows,
        ]);
    }

    private function reportStatements(int $limit)
    {
        $rows = Customer::query()
            ->orderBy('name')
            ->limit($limit)
            ->get(['id', 'name', 'phone_number', 'city'])
            ->map(fn (Customer $c) => [
                'customer_id' => $c->id,
                'customer' => $c->name,
                'phone' => $c->phone_number,
                'city' => $c->city,
                'statement_path' => '/admin/customers/view/' . $c->id,
            ])
            ->values();

        return response()->json([
            'title' => 'Statements',
            'description' => 'Open a customer to generate their account statement from Documents.',
            'columns' => ['customer_id', 'customer', 'phone', 'city', 'statement_path'],
            'rows' => $rows,
        ]);
    }

    private function reportTax()
    {
        $invoiceTotal = (float) Invoice::query()->sum('total');
        $paymentTotal = (float) Payment::query()->sum('sum');
        // Kenya VAT display assumption for reporting only (not stored separately).
        $vatRate = 0.16;
        $vatPortion = round($invoiceTotal - ($invoiceTotal / (1 + $vatRate)), 2);
        $net = round($invoiceTotal - $vatPortion, 2);

        return response()->json([
            'title' => 'Tax reports',
            'description' => 'Invoice totals with estimated 16% VAT inclusive split (reporting aid).',
            'columns' => ['metric', 'value'],
            'rows' => [
                ['metric' => 'Invoice gross total', 'value' => $invoiceTotal],
                ['metric' => 'Estimated net (ex-VAT)', 'value' => $net],
                ['metric' => 'Estimated VAT (16%)', 'value' => $vatPortion],
                ['metric' => 'Payments received', 'value' => $paymentTotal],
            ],
        ]);
    }

    private function reportInvoices(int $limit)
    {
        $rows = Invoice::query()
            ->orderByDesc('invoice_date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(function (Invoice $inv) {
                $service = Service::query()->find($inv->services_id);

                return [
                    'invoice_id' => $inv->id,
                    'service_id' => $inv->services_id,
                    'customer_id' => $service?->customer_id,
                    'customer' => $this->customerName($service?->customer_id),
                    'invoice_date' => $inv->invoice_date,
                    'due_date' => $inv->due_date,
                    'total' => $inv->total,
                    'status' => is_array($inv->status) ? ($inv->status['label'] ?? $inv->status['value'] ?? '') : $inv->status,
                ];
            })
            ->values();

        return response()->json([
            'title' => 'Invoice report',
            'description' => 'Recent invoices across all customers.',
            'columns' => ['invoice_id', 'service_id', 'customer_id', 'customer', 'invoice_date', 'due_date', 'total', 'status'],
            'rows' => $rows,
        ]);
    }

    private function reportNewServices(int $limit)
    {
        $rows = Service::query()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (Service $s) => [
                'service_id' => $s->id,
                'customer_id' => $s->customer_id,
                'customer' => $this->customerName($s->customer_id),
                'plan' => $s->plan_title,
                'price' => $s->price,
                'created_at' => $s->created_at,
                'start_date' => $s->start_date,
                'status' => is_array($s->status) ? ($s->status['label'] ?? $s->status['value'] ?? '') : $s->status,
            ])
            ->values();

        return response()->json([
            'title' => 'New services report',
            'description' => 'Services ordered by creation date.',
            'columns' => ['service_id', 'customer_id', 'customer', 'plan', 'price', 'created_at', 'start_date', 'status'],
            'rows' => $rows,
        ]);
    }

    private function reportCustomPrices(int $limit)
    {
        $plans = Plan::query()->get()->keyBy('id');
        $rows = Service::query()
            ->orderByDesc('id')
            ->limit(min(2000, $limit * 2))
            ->get()
            ->filter(function (Service $s) use ($plans) {
                $planPrice = isset($plans[$s->plan_id]) ? (float) ($plans[$s->plan_id]->price ?? 0) : null;
                if ($planPrice === null) {
                    return false;
                }

                return abs((float) $s->price - $planPrice) > 0.009;
            })
            ->take($limit)
            ->map(function (Service $s) use ($plans) {
                $planPrice = (float) ($plans[$s->plan_id]->price ?? 0);

                return [
                    'service_id' => $s->id,
                    'customer_id' => $s->customer_id,
                    'customer' => $this->customerName($s->customer_id),
                    'plan' => $s->plan_title,
                    'plan_price' => $planPrice,
                    'service_price' => (float) $s->price,
                    'difference' => round((float) $s->price - $planPrice, 2),
                ];
            })
            ->values();

        return response()->json([
            'title' => 'Custom prices & discounts',
            'description' => 'Services whose price differs from the tariff plan price.',
            'columns' => ['service_id', 'customer_id', 'customer', 'plan', 'plan_price', 'service_price', 'difference'],
            'rows' => $rows,
        ]);
    }

    private function reportTransactionCategories()
    {
        $rows = Payment::query()
            ->selectRaw('payment_type, COUNT(*) as count, SUM(sum) as total')
            ->groupBy('payment_type')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'payment_type' => $r->payment_type ?: 'unknown',
                'count' => (int) $r->count,
                'total' => (float) $r->total,
            ])
            ->values();

        return response()->json([
            'title' => 'Transactions categories',
            'description' => 'Payments grouped by payment type.',
            'columns' => ['payment_type', 'count', 'total'],
            'rows' => $rows,
        ]);
    }

    private function reportContracts(int $limit)
    {
        $rows = Customer::query()
            ->orderBy('name')
            ->limit($limit)
            ->get(['id', 'name', 'phone_number', 'address', 'city', 'created_at'])
            ->map(fn (Customer $c) => [
                'customer_id' => $c->id,
                'customer' => $c->name,
                'phone' => $c->phone_number,
                'address' => $c->address,
                'city' => $c->city,
                'since' => $c->created_at,
                'documents_path' => '/admin/customers/view/' . $c->id,
            ])
            ->values();

        return response()->json([
            'title' => 'Customer contracts',
            'description' => 'Customer records used as contract index. Open a customer for documents/statements.',
            'columns' => ['customer_id', 'customer', 'phone', 'address', 'city', 'since', 'documents_path'],
            'rows' => $rows,
        ]);
    }

    private function reportChanges(int $limit)
    {
        if (!Schema::hasTable('service_change_logs')) {
            return response()->json([
                'title' => 'Change statuses & plans',
                'description' => 'Service change log table is not available.',
                'columns' => ['id', 'service_id', 'field', 'old_value', 'new_value', 'changed_by', 'created_at'],
                'rows' => [],
            ]);
        }

        $rows = ServiceChangeLog::query()
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (ServiceChangeLog $log) => [
                'id' => $log->id,
                'service_id' => $log->service_id,
                'field' => $log->field,
                'old_value' => is_scalar($log->old_value) ? $log->old_value : json_encode($log->old_value),
                'new_value' => is_scalar($log->new_value) ? $log->new_value : json_encode($log->new_value),
                'changed_by' => $log->changed_by,
                'notes' => $log->notes,
                'created_at' => $log->created_at,
            ])
            ->values();

        return response()->json([
            'title' => 'Change statuses & plans',
            'description' => 'Audit log of service field changes.',
            'columns' => ['id', 'service_id', 'field', 'old_value', 'new_value', 'changed_by', 'notes', 'created_at'],
            'rows' => $rows,
        ]);
    }

    private function reportPending(int $limit)
    {
        $rows = Service::query()
            ->where(function ($q) {
                $q->whereNull('mikrotik_id')
                    ->orWhere('mikrotik_id', '')
                    ->orWhereNull('synced_at');
            })
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (Service $s) => [
                'service_id' => $s->id,
                'customer_id' => $s->customer_id,
                'customer' => $this->customerName($s->customer_id),
                'plan' => $s->plan_title,
                'mikrotik_id' => $s->mikrotik_id,
                'synced_at' => $s->synced_at,
                'status' => is_array($s->status) ? ($s->status['label'] ?? $s->status['value'] ?? '') : $s->status,
            ])
            ->values();

        return response()->json([
            'title' => 'Pending statuses & services',
            'description' => 'Services missing MikroTik sync or identity.',
            'columns' => ['service_id', 'customer_id', 'customer', 'plan', 'mikrotik_id', 'synced_at', 'status'],
            'rows' => $rows,
        ]);
    }
}
