<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class AccountDiagnosticService
{
    public function diagnose(string $identifier): array
    {
        $identifier = trim($identifier);
        $phoneSuffix = $this->phoneSuffix($identifier);

        $customers = $this->safe(function () use ($identifier, $phoneSuffix) {
            if (!Schema::hasTable('customers')) {
                return [];
            }

            return DB::table('customers')
                ->select(['id', 'name', 'phone_number', 'billing_type', 'category', 'deleted_at'])
                ->where(function ($query) use ($identifier, $phoneSuffix) {
                    $query->where('phone_number', $identifier);
                    if ($phoneSuffix !== null) {
                        $query->orWhereRaw(
                            "RIGHT(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', ''), 9) = ?",
                            [$phoneSuffix]
                        );
                    }
                })
                ->limit(5)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();
        });

        $customerIds = array_values(array_filter(array_column($customers, 'id')));

        $services = $this->safe(function () use ($identifier, $customerIds) {
            if (!Schema::hasTable('services')) {
                return [];
            }

            $query = DB::table('services as s')
                ->leftJoin('plans as p', 'p.id', '=', 's.plan_id')
                ->leftJoin('routers as r', 'r.id', '=', 's.router_id')
                ->select([
                    's.id',
                    's.customer_id',
                    's.mikrotik_name',
                    's.status',
                    's.start_date',
                    's.end_date',
                    's.bill_to',
                    's.billing_type',
                    's.price',
                    's.plan_id',
                    's.router_id',
                    's.updated_at',
                    'p.title as plan',
                    'p.rate_limit',
                    'r.title as router',
                    'r.host as router_host',
                    'r.nas_ip as assigned_nas',
                ])
                ->whereNull('s.deleted_at')
                ->where(function ($subQuery) use ($identifier, $customerIds) {
                    $subQuery->where('s.mikrotik_name', $identifier);
                    if ($customerIds !== []) {
                        $subQuery->orWhereIn('s.customer_id', $customerIds);
                    }
                })
                ->limit(10);

            return $query->get()->map(fn ($row) => (array) $row)->all();
        });

        if ($customers === [] && $services !== []) {
            $serviceCustomerIds = array_values(array_unique(array_filter(array_column($services, 'customer_id'))));
            $customers = $this->safe(fn () => DB::table('customers')
                ->select(['id', 'name', 'phone_number', 'billing_type', 'category', 'deleted_at'])
                ->whereIn('id', $serviceCustomerIds)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all());
            $customerIds = $serviceCustomerIds;
        }

        $usernames = array_values(array_unique(array_filter(array_column($services, 'mikrotik_name'))));
        $serviceIds = array_values(array_filter(array_column($services, 'id')));

        $radiusChecks = $this->radiusAttributes('radcheck', $usernames);
        $radiusReplies = $this->radiusAttributes('radreply', $usernames);

        $openSessions = $this->safe(function () use ($usernames) {
            if ($usernames === [] || !Schema::hasTable('radacct')) {
                return [];
            }

            return DB::table('radacct')
                ->select([
                    'radacctid', 'username', 'nasipaddress', 'framedipaddress',
                    'acctstarttime', 'acctupdatetime', 'acctsessiontime',
                    'callingstationid', 'nasportid',
                ])
                ->whereIn('username', $usernames)
                ->whereNull('acctstoptime')
                ->orderByDesc('radacctid')
                ->limit(10)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();
        });

        $recentSessions = $this->safe(function () use ($usernames) {
            if ($usernames === [] || !Schema::hasTable('radacct')) {
                return [];
            }

            return DB::table('radacct')
                ->select([
                    'radacctid', 'username', 'nasipaddress', 'framedipaddress',
                    'acctstarttime', 'acctupdatetime', 'acctstoptime',
                    'acctsessiontime', 'callingstationid', 'acctterminatecause',
                ])
                ->whereIn('username', $usernames)
                ->orderByDesc('radacctid')
                ->limit(15)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();
        });

        $recentAuth = $this->safe(function () use ($usernames) {
            if ($usernames === [] || !Schema::hasTable('radpostauth')) {
                return [];
            }

            return DB::table('radpostauth')
                ->select(['id', 'username', 'reply', 'authdate'])
                ->whereIn('username', $usernames)
                ->orderByDesc('id')
                ->limit(25)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();
        });

        $invoices = $this->safe(function () use ($serviceIds) {
            if ($serviceIds === [] || !Schema::hasTable('invoices')) {
                return [];
            }

            return DB::table('invoices as i')
                ->leftJoin('payments as pay', 'pay.invoice_id', '=', 'i.id')
                ->select([
                    'i.id', 'i.services_id', 'i.invoice_date', 'i.due_date',
                    'i.total', 'i.status', 'i.deleted_at',
                ])
                ->selectRaw('COALESCE(SUM(pay.sum), 0) as paid')
                ->whereIn('i.services_id', $serviceIds)
                ->whereNull('i.deleted_at')
                ->groupBy([
                    'i.id', 'i.services_id', 'i.invoice_date', 'i.due_date',
                    'i.total', 'i.status', 'i.deleted_at',
                ])
                ->orderByDesc('i.id')
                ->limit(10)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();
        });

        $payments = $this->safe(function () use ($customerIds) {
            if ($customerIds === [] || !Schema::hasTable('payments')) {
                return [];
            }

            return DB::table('payments')
                ->select(['id', 'customer_id', 'invoice_id', 'trans_id', 'payment_type', 'date', 'sum'])
                ->whereIn('customer_id', $customerIds)
                ->orderByDesc('id')
                ->limit(10)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();
        });

        return [
            'generated_at' => now()->toIso8601String(),
            'searched_identifier' => $identifier,
            'customers' => $customers,
            'services' => $services,
            'radius' => [
                'checks' => $radiusChecks,
                'replies' => $radiusReplies,
                'open_sessions' => $openSessions,
                'recent_sessions' => $recentSessions,
                'recent_authentication' => $recentAuth,
            ],
            'billing' => [
                'invoices' => $invoices,
                'payments' => $payments,
            ],
            'limitations' => [
                'This is a read-only database diagnosis.',
                'A database session marked open is considered live only when acctupdatetime is recent.',
                'No customer, RADIUS, router, or database passwords are exposed to the AI provider.',
                'A live CPE or MikroTik traffic test is not performed by this endpoint.',
            ],
        ];
    }

    private function radiusAttributes(string $table, array $usernames): array
    {
        return $this->safe(function () use ($table, $usernames) {
            if ($usernames === [] || !Schema::hasTable($table)) {
                return [];
            }

            return DB::table($table)
                ->select(['id', 'username', 'attribute', 'op', 'value'])
                ->whereIn('username', $usernames)
                ->orderBy('id')
                ->get()
                ->map(function ($row) {
                    $item = (array) $row;
                    if (str_contains(strtolower((string) $item['attribute']), 'password')) {
                        $item['value'] = '[configured; redacted]';
                    }
                    return $item;
                })
                ->all();
        });
    }

    private function phoneSuffix(string $identifier): ?string
    {
        $digits = preg_replace('/\D+/', '', $identifier);
        return strlen($digits) >= 9 ? substr($digits, -9) : null;
    }

    private function safe(callable $callback): array
    {
        try {
            return $callback();
        } catch (Throwable $exception) {
            report($exception);
            return [];
        }
    }
}
