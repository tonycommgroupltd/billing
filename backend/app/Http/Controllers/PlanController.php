<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Plan;
use App\Http\Resources\PlanCollection;
use App\Models\Service;
use App\Models\Radacct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Validator;

class PlanController extends Controller
{
    /**
     * Create a new AuthController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
        ];

        $validator = Validator::make($request->all(), [
            'router_id' => 'required|numeric',
            'title' => 'required|string|unique:plans',
            'rate_limit' => 'required',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $plan = Plan::create($request->all());

        return response()->json([
            'message' => 'Plan added',
            'plan' => $plan
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $plan = Plan::find($id);

        return response()->json([
            'plan' => $plan,
        ], 200);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
        ];

        $validator = Validator::make($request->all(), [
            'router_id' => 'required|numeric',
            'title' => 'required|string|unique:plans,title,' . $id,
            'rate_limit' => 'required',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $plan = Plan::find($id);
        $plan->fill($request->all())->save();
        return response()->json([
            'message' => 'Plan saved',
            'plan' => $plan
        ], 200);
    }

    public function ajax(Request $request)
    {

        $plan = (new Plan)->newQuery();
        if (request()->has('q')) {
            $plan->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }

        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new PlanCollection($plan->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $plan = Plan::find($id);
        $plan->delete();
        return response()->json([
            'message' => 'Plan deleted'
        ], 200);
    }

    public function allPlans()
    {
        $has_more = false;
        $plans = (new Plan)->newQuery();
        $per_page = request('per_page', 10);
        if (request()->has('q')) {
            $plans->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $results = new PlanCollection($plans->orderBy('title', 'ASC')->paginate($per_page));

        if (request('page') < $results->lastPage()) {
            $has_more = true;
        }

        return response()->json([
            'options' => $results,
            'has_more' => $has_more
        ]);
    }

    /**
     * Group plans by speed (rate_limit.label) for create-service UI.
     * Each group lists router variants — picking one still uses the real plan_id.
     */
    public function planGroups()
    {
        $plans = Plan::query()->orderBy('title', 'ASC')->get();
        $grouped = [];

        foreach ($plans as $plan) {
            $rateLimit = is_array($plan->rate_limit) ? $plan->rate_limit : [];
            $rate = trim((string) ($rateLimit['label'] ?? $rateLimit['value'] ?? ''));

            if ($rate === '' && preg_match('/(\d+)\s*M(?:B(?:PS)?)?/i', (string) $plan->title, $m)) {
                $rate = $m[1] . 'M';
            }
            if ($rate === '') {
                $rate = (string) ($plan->title ?: 'Other');
            }

            $key = strtoupper($rate);
            if (!isset($grouped[$key])) {
                $speedNum = null;
                if (preg_match('/(\d+)/', $key, $nm)) {
                    $speedNum = (int) $nm[1];
                }
                $grouped[$key] = [
                    'key' => $key,
                    'rate' => $rate,
                    'label' => $this->formatPlanSpeedLabel($key),
                    'speed_mbps' => $speedNum,
                    'variants' => [],
                ];
            }

            $grouped[$key]['variants'][] = [
                'id' => $plan->id,
                'title' => $plan->title,
                'price' => $plan->price,
                'weekly_price' => $plan->weekly_price,
                'bi_weekly_price' => $plan->bi_weekly_price,
                'rate_limit' => $plan->rate_limit,
                'router_id' => $plan->router_id,
                'router_name' => $plan->router_name,
                'label' => trim(($plan->router_name ?: 'Router') . ' — ' . $plan->title),
            ];
        }

        $groups = array_values($grouped);
        usort($groups, function ($a, $b) {
            $aExpired = stripos($a['key'], 'EXPIRED') !== false ? 1 : 0;
            $bExpired = stripos($b['key'], 'EXPIRED') !== false ? 1 : 0;
            if ($aExpired !== $bExpired) {
                return $aExpired <=> $bExpired;
            }
            $aSpeed = $a['speed_mbps'];
            $bSpeed = $b['speed_mbps'];
            if ($aSpeed !== null && $bSpeed !== null && $aSpeed !== $bSpeed) {
                return $aSpeed <=> $bSpeed;
            }
            if ($aSpeed !== null && $bSpeed === null) {
                return -1;
            }
            if ($aSpeed === null && $bSpeed !== null) {
                return 1;
            }
            return strcasecmp($a['label'], $b['label']);
        });

        foreach ($groups as &$group) {
            usort($group['variants'], function ($a, $b) {
                return strcasecmp($a['router_name'] ?? '', $b['router_name'] ?? '');
            });
        }
        unset($group);

        return response()->json([
            'groups' => $groups,
            'total_plans' => $plans->count(),
            'total_groups' => count($groups),
        ]);
    }

    private function formatPlanSpeedLabel(string $key): string
    {
        if (stripos($key, 'EXPIRED') !== false) {
            return 'EXPIRED';
        }
        if (preg_match('/(\d+)/', $key, $m)) {
            return $m[1] . ' Mbps';
        }
        return $key;
    }

    public function allRouterPlans($id)
    {
        $plan = [];
        $service = Service::find($id);
        if ($service) {
            $plan = Plan::find($service->plan_id);
        }
        $has_more = false;
        $plans = (new Plan)->newQuery();
        if ($plan) {
            $plans->where('router_id', $plan->router_id);
        }
        $per_page = request('per_page', 10);
        if (request()->has('q')) {
            $plans->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $results = new PlanCollection($plans->orderBy('title', 'ASC')->paginate($per_page));

        if (request('page') < $results->lastPage()) {
            $has_more = true;
        }

        return response()->json([
            'options' => $results,
            'has_more' => $has_more
        ]);
    }

    /**
     * Package usage grouped by unique package identity (title + price).
     * Same package on many routers appears once with combined counts.
     */
    public function packageUsage()
    {
        $onlineSet = array_fill_keys($this->onlineServiceUsernames(), true);

        $serviceRows = DB::table('services')
            ->whereNull('deleted_at')
            ->whereNotNull('plan_id')
            ->select('id', 'plan_id', 'customer_id', 'mikrotik_name', 'status')
            ->get();

        $byPlan = [];
        foreach ($serviceRows as $row) {
            $planId = (int) $row->plan_id;
            if (!isset($byPlan[$planId])) {
                $byPlan[$planId] = [
                    'service_count' => 0,
                    'customers' => [],
                    'active_count' => 0,
                    'online_count' => 0,
                    'offline_count' => 0,
                    'expired_count' => 0,
                ];
            }

            $byPlan[$planId]['service_count']++;
            if ($row->customer_id) {
                $byPlan[$planId]['customers'][(int) $row->customer_id] = true;
            }

            $status = is_string($row->status) ? json_decode($row->status, true) : $row->status;
            $statusValue = is_array($status) ? (int) ($status['value'] ?? 0) : 0;

            if ($statusValue === 2) {
                $byPlan[$planId]['active_count']++;
                $username = (string) ($row->mikrotik_name ?? '');
                if ($username !== '' && isset($onlineSet[$username])) {
                    $byPlan[$planId]['online_count']++;
                } else {
                    $byPlan[$planId]['offline_count']++;
                }
            } elseif ($statusValue === 3) {
                $byPlan[$planId]['expired_count']++;
            }
        }

        $query = Plan::query()->orderBy('title', 'ASC');
        if (request()->filled('q')) {
            $q = request('q');
            $query->where('title', 'like', '%' . $q . '%');
        }

        $groups = [];
        foreach ($query->get() as $plan) {
            $identity = $this->normalizePackageIdentity((string) $plan->title);
            $groupKey = $identity['key'] . '|' . number_format((float) $plan->price, 2, '.', '');
            $exactTitle = trim((string) $plan->title);
            if ($exactTitle === '') {
                $exactTitle = $identity['display'];
            }

            if (!isset($groups[$groupKey])) {
                $groups[$groupKey] = [
                    'group_key' => $groupKey,
                    'title' => $identity['display'],
                    'price' => $plan->price,
                    'rate_limit' => $plan->rate_limit,
                    'plan_ids' => [],
                    'variants' => [],
                    'service_count' => 0,
                    'customers' => [],
                    'active_count' => 0,
                    'online_count' => 0,
                    'offline_count' => 0,
                    'expired_count' => 0,
                ];
            }

            $groups[$groupKey]['plan_ids'][] = (int) $plan->id;

            if (!isset($groups[$groupKey]['variants'][$exactTitle])) {
                $groups[$groupKey]['variants'][$exactTitle] = [
                    'title' => $exactTitle,
                    'plan_ids' => [],
                    'customers' => [],
                    'service_count' => 0,
                    'online_count' => 0,
                    'offline_count' => 0,
                    'expired_count' => 0,
                ];
            }
            $groups[$groupKey]['variants'][$exactTitle]['plan_ids'][] = (int) $plan->id;

            if ($plan->rate_limit && !$groups[$groupKey]['rate_limit']) {
                $groups[$groupKey]['rate_limit'] = $plan->rate_limit;
            }

            $stats = $byPlan[(int) $plan->id] ?? null;
            if ($stats) {
                $groups[$groupKey]['service_count'] += $stats['service_count'];
                $groups[$groupKey]['active_count'] += $stats['active_count'];
                $groups[$groupKey]['online_count'] += $stats['online_count'];
                $groups[$groupKey]['offline_count'] += $stats['offline_count'];
                $groups[$groupKey]['expired_count'] += $stats['expired_count'];
                foreach ($stats['customers'] as $customerId => $_) {
                    $groups[$groupKey]['customers'][$customerId] = true;
                    $groups[$groupKey]['variants'][$exactTitle]['customers'][$customerId] = true;
                }
                $groups[$groupKey]['variants'][$exactTitle]['service_count'] += $stats['service_count'];
                $groups[$groupKey]['variants'][$exactTitle]['online_count'] += $stats['online_count'];
                $groups[$groupKey]['variants'][$exactTitle]['offline_count'] += $stats['offline_count'];
                $groups[$groupKey]['variants'][$exactTitle]['expired_count'] += $stats['expired_count'];
            }
        }

        $includeEmpty = request()->boolean('all');
        $data = collect(array_values($groups))
            ->map(function ($group) {
                $planIds = array_values(array_unique(array_map('intval', $group['plan_ids'])));
                $nameBreakdown = collect(array_values($group['variants']))
                    ->map(function ($variant) {
                        $ids = array_values(array_unique(array_map('intval', $variant['plan_ids'])));
                        return [
                            'title' => $variant['title'],
                            'plan_ids' => $ids,
                            'customer_count' => count($variant['customers']),
                            'service_count' => $variant['service_count'],
                            'online_count' => $variant['online_count'],
                            'offline_count' => $variant['offline_count'],
                            'expired_count' => $variant['expired_count'],
                        ];
                    })
                    ->sortByDesc('customer_count')
                    ->values()
                    ->all();

                return [
                    'group_key' => $group['group_key'],
                    'plan_id' => $planIds[0] ?? null,
                    'plan_ids' => $planIds,
                    'title' => $group['title'],
                    'price' => $group['price'],
                    'rate_limit' => $group['rate_limit'],
                    'name_breakdown' => $nameBreakdown,
                    'service_count' => $group['service_count'],
                    'customer_count' => count($group['customers']),
                    'active_count' => $group['active_count'],
                    'online_count' => $group['online_count'],
                    'offline_count' => $group['offline_count'],
                    'expired_count' => $group['expired_count'],
                ];
            })
            ->filter(function ($row) use ($includeEmpty) {
                if ($includeEmpty) {
                    return true;
                }
                return ($row['service_count'] ?? 0) > 0 || ($row['customer_count'] ?? 0) > 0;
            })
            ->sortBy(function ($row) {
                // Natural speed sort: 5 Mbps before 10 Mbps, then alpha for others.
                if (preg_match('/^(\d+(?:\.\d+)?)\s*Mbps$/i', (string) $row['title'], $m)) {
                    return sprintf('0-%010.2f', (float) $m[1]);
                }
                if (preg_match('/^(\d+(?:\.\d+)?)\s*Gbps$/i', (string) $row['title'], $m)) {
                    return sprintf('1-%010.2f', (float) $m[1]);
                }
                return '2-' . mb_strtolower((string) $row['title']);
            })
            ->values();

        return response()->json([
            'summary' => [
                'plans' => $data->count(),
                'services' => $data->sum('service_count'),
                'customers' => $data->sum('customer_count'),
                'active' => $data->sum('active_count'),
                'online' => $data->sum('online_count'),
                'offline' => $data->sum('offline_count'),
                'expired' => $data->sum('expired_count'),
            ],
            'data' => $data,
        ]);
    }

    /**
     * Customers / services on a package group (all plan rows with same title+price),
     * or a single plan id for backwards compatibility.
     */
    public function packageUsageCustomers($id)
    {
        $planIds = [];
        if (request()->filled('plan_ids')) {
            $planIds = collect(explode(',', (string) request('plan_ids')))
                ->map(fn ($v) => (int) trim($v))
                ->filter()
                ->unique()
                ->values()
                ->all();
        }

        $plan = null;
        if (!$planIds) {
            $plan = Plan::find($id);
            if (!$plan) {
                return response()->json(['message' => 'Plan not found'], 404);
            }
            $planIds = Plan::query()
                ->get(['id', 'title', 'price'])
                ->filter(function ($row) use ($plan) {
                    return $this->packageGroupKey($row->title, $row->price)
                        === $this->packageGroupKey($plan->title, $plan->price);
                })
                ->pluck('id')
                ->map(fn ($v) => (int) $v)
                ->values()
                ->all();
        } else {
            $plan = Plan::whereIn('id', $planIds)->orderBy('id')->first();
        }

        if (!$planIds) {
            return response()->json(['message' => 'Plan not found'], 404);
        }

        $onlineSet = array_fill_keys($this->onlineServiceUsernames(), true);

        $rows = DB::table('services')
            ->leftJoin('customers', 'customers.id', '=', 'services.customer_id')
            ->leftJoin('plans', 'plans.id', '=', 'services.plan_id')
            ->whereIn('services.plan_id', $planIds)
            ->whereNull('services.deleted_at')
            ->select(
                'services.id as service_id',
                'services.customer_id',
                'services.mikrotik_name',
                'services.status',
                'services.price',
                'services.billing_type',
                'services.plan_id',
                'customers.name as customer_name',
                'customers.phone_number',
                'plans.router_name'
            )
            ->orderBy('customers.name')
            ->get()
            ->map(function ($row) use ($onlineSet) {
                $status = is_string($row->status) ? json_decode($row->status, true) : $row->status;
                $statusValue = is_array($status) ? (int) ($status['value'] ?? 0) : 0;
                $billing = is_string($row->billing_type) ? json_decode($row->billing_type, true) : $row->billing_type;
                $username = (string) ($row->mikrotik_name ?? '');
                $isOnline = $statusValue === 2 && $username !== '' && isset($onlineSet[$username]);

                return [
                    'service_id' => $row->service_id,
                    'customer_id' => $row->customer_id,
                    'customer_name' => $row->customer_name ?: 'Unknown',
                    'phone_number' => $row->phone_number,
                    'mikrotik_name' => $row->mikrotik_name,
                    'price' => $row->price,
                    'billing_type' => $billing,
                    'status' => is_array($status) ? $status : ['value' => $statusValue, 'label' => 'Unknown'],
                    'online' => $isOnline ? 1 : 0,
                    'connection' => $isOnline ? 'online' : ($statusValue === 2 ? 'offline' : 'inactive'),
                    'plan_id' => (int) $row->plan_id,
                    'router_name' => $row->router_name,
                ];
            });

        $filter = request('filter', 'all');
        if ($filter === 'online') {
            $rows = $rows->filter(fn ($r) => $r['online'] === 1)->values();
        } elseif ($filter === 'offline') {
            $rows = $rows->filter(fn ($r) => $r['connection'] === 'offline')->values();
        } elseif ($filter === 'active') {
            $rows = $rows->filter(fn ($r) => (int) ($r['status']['value'] ?? 0) === 2)->values();
        }

        return response()->json([
            'plan' => [
                'id' => $plan?->id,
                'plan_ids' => $planIds,
                'title' => $plan?->title,
                'price' => $plan?->price,
                'router_name' => count($planIds) > 1 ? (count($planIds) . ' plan rows') : ($plan?->router_name),
            ],
            'total' => $rows->count(),
            'data' => $rows,
        ]);
    }

    /**
     * Normalize package names so "5mb", "5Mbps", "5 mbps" share one identity.
     * @return array{key:string,display:string}
     */
    private function normalizePackageIdentity(string $title): array
    {
        $raw = trim(preg_replace('/\s+/u', ' ', $title) ?? '');
        $lower = mb_strtolower($raw);

        if (preg_match('/(\d+(?:\.\d+)?)\s*(gbps|gbit\/s|gb|mbps|mbit\/s|mbit|mb\/s|mb|m)\b/u', $lower, $m)) {
            $num = $m[1];
            $unit = $m[2];
            $isGiga = str_starts_with($unit, 'g');
            return [
                'key' => $num . ($isGiga ? 'gbps' : 'mbps'),
                'display' => $num . ($isGiga ? ' Gbps' : ' Mbps'),
            ];
        }

        return [
            'key' => $lower !== '' ? $lower : 'unknown',
            'display' => $raw !== '' ? $raw : 'Unknown',
        ];
    }

    private function packageGroupKey($title, $price): string
    {
        $identity = $this->normalizePackageIdentity((string) $title);
        return $identity['key'] . '|' . number_format((float) $price, 2, '.', '');
    }

    private function onlineServiceUsernames(): array
    {
        $ago = Carbon::now()->subMinutes(7);

        return Radacct::join('services', 'services.mikrotik_name', '=', 'radacct.username')
            ->where('services.status->value', 2)
            ->whereNull('radacct.acctstoptime')
            ->where('radacct.acctupdatetime', '>=', $ago)
            ->whereNull('services.deleted_at')
            ->distinct()
            ->pluck('radacct.username')
            ->all();
    }
}
