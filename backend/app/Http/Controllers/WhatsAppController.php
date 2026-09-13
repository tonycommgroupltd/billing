<?php

namespace App\Http\Controllers;

use App\Exceptions\CustomException;
use App\Http\Resources\WhatsappDetailCollection;
use App\Models\Customer;
use App\Models\WhatsappDetail;
use App\Models\WhatsappTemplate;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class WhatsAppController extends Controller
{
    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $whatsapp = WhatsappDetail::leftJoin('customers', 'whatsapp_details.customer_id', '=', 'customers.id')->select('whatsapp_details.*', 'customers.name')->find($id);
        return response()->json([
            'whatsapp' => $whatsapp
        ], 200);
    }

    public function ajaxInbox()
    {
        $whatsapp = (new WhatsappDetail())->newQuery();
        $whatsapp->leftJoin('customers', 'whatsapp_details.customer_id', '=', 'customers.id');
        $whatsapp->select('whatsapp_details.*', 'customers.name AS name');
        $whatsapp->where('data->metadata->phone_number_id', config('whatsapp.from_phone_number_id'))->where(function ($query) {
            $query->where('statuses', DB::raw("json_array()"))
                ->orWhere('statuses', NULL);
        });
        if (request()->has('q') && request()->input('q') !== '') {
            $q = request()->input('q');
            $whatsapp->where(function ($query) use ($q) {
                $query->where('customers.name', 'like', '%' . $q . '%')
                    ->orWhere('whatsapp_details.status', 'like', '%' . $q . '%')
                    ->orWhere('whatsapp_details.message_description', 'like', '%' . $q . '%');
            });
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'desc');
        $sortCol = request('sort_col', 'id');
        $result = new WhatsappDetailCollection($whatsapp->orderBy($sortCol, $sort)->paginate($per_page));

        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxOutbox()
    {
        $whatsapp = (new WhatsappDetail())->newQuery();
        $whatsapp->leftJoin('customers', 'whatsapp_details.customer_id', '=', 'customers.id');
        $whatsapp->select('whatsapp_details.*', 'customers.name AS name');
        $whatsapp->whereNull('data->metadata->phone_number_id')->where(function ($query) {
            $query->where('statuses', DB::raw("json_array()"))
                ->orWhere('statuses', NULL);
        });
        if (request()->has('q') && request()->input('q') !== '') {
            $q = request()->input('q');
            $whatsapp->where(function ($query) use ($q) {
                $query->where('customers.name', 'like', '%' . $q . '%')
                    ->orWhere('whatsapp_details.status', 'like', '%' . $q . '%')
                    ->orWhere('whatsapp_details.message_description', 'like', '%' . $q . '%');
            });
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'desc');
        $sortCol = request('sort_col', 'id');
        $result = new WhatsappDetailCollection($whatsapp->orderBy($sortCol, $sort)->paginate($per_page));

        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function destroy($id)
    {
        $whatsapp = WhatsappDetail::find($id);
        $whatsapp->delete();
        return response()->json([
            'message' => 'WhatsApp message deleted'
        ], 200);
    }

    public function listTemplates()
    {
        $templates = WhatsappTemplate::query()
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', 'APPROVED');
            })
            ->orderBy('name')
            ->orderByDesc('id')
            ->get()
            ->unique('name')
            ->values()
            ->map(function (WhatsappTemplate $t) {
                return [
                    'id' => $t->id,
                    'name' => $t->name,
                    'language' => $t->language,
                    'category' => $t->category,
                    'status' => $t->status,
                    'description' => $t->description,
                    'body' => $t->body,
                    'param_count' => $this->templateParamCount($t),
                ];
            });

        return response()->json(['data' => $templates]);
    }

    public function sendSingle(Request $request)
    {
        $data = $request->validate([
            'mode' => 'nullable|string|in:template,text',
            'phone' => 'nullable|string|max:20',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'template_id' => 'nullable|integer|exists:whatsapp_templates,id',
            'template_name' => 'nullable|string|max:120',
            'fields' => 'nullable|array',
            'fields.*' => 'nullable|string|max:500',
            'message' => 'nullable|string|max:4096',
        ]);

        $mode = $data['mode'] ?? 'template';
        if (empty($data['phone']) && empty($data['customer_id'])) {
            return response()->json(['message' => 'Provide a phone number or select a customer.'], 422);
        }

        $customerId = (int) ($data['customer_id'] ?? 0);
        $phone = $data['phone'] ?? null;
        if ($customerId) {
            $customer = Customer::find($customerId);
            if (!$phone) {
                $phone = $customer?->phone_number;
            }
        }

        $mobile = $this->normalizeMobile($phone);
        if (!$mobile) {
            return response()->json(['message' => 'Invalid or unsupported phone number.'], 422);
        }

        if ($mode === 'text') {
            if (empty($data['message'])) {
                return response()->json(['message' => 'Message text is required.'], 422);
            }
            $result = $this->dispatchText($mobile, $data['message'], $customerId ?: null);
        } else {
            $template = $this->resolveTemplate($data);
            if (!$template) {
                return response()->json(['message' => 'WhatsApp template not found.'], 422);
            }
            $result = $this->dispatchTemplate($mobile, $template, $data['fields'] ?? [], $customerId ?: null);
        }

        return response()->json($result, !empty($result['ok']) ? 200 : 422);
    }

    public function sendGroup(Request $request)
    {
        $data = $request->validate([
            'template_id' => 'nullable|integer|exists:whatsapp_templates,id',
            'template_name' => 'nullable|string|max:120',
            'fields' => 'nullable|array',
            'fields.*' => 'nullable|string|max:500',
            'billing_type' => 'nullable|integer|in:1,2',
            'category' => 'nullable|integer|in:1,2,3',
            'send_via' => 'nullable|string|in:whatsapp,sms,all',
            'service_status' => 'nullable|integer|in:0,1,2,3',
            'preview_only' => 'nullable|boolean',
        ]);

        $template = $this->resolveTemplate($data);
        if (!$template) {
            return response()->json(['message' => 'WhatsApp template not found.'], 422);
        }

        $query = $this->groupAudienceQuery($data);
        $customers = $query->select('id', 'name', 'phone_number', 'send_via')->limit(500)->get();

        if (!empty($data['preview_only'])) {
            $valid = 0;
            foreach ($customers as $customer) {
                if ($this->normalizeMobile($customer->phone_number)) {
                    $valid++;
                }
            }
            return response()->json([
                'preview' => true,
                'template' => $template->name,
                'matched' => $customers->count(),
                'valid_recipients' => $valid,
            ]);
        }

        $sent = 0;
        $failed = 0;
        $invalid = 0;
        $errors = [];

        foreach ($customers as $customer) {
            $mobile = $this->normalizeMobile($customer->phone_number);
            if (!$mobile) {
                $invalid++;
                continue;
            }
            $result = $this->dispatchTemplate($mobile, $template, $data['fields'] ?? [], $customer->id);
            if (!empty($result['ok'])) {
                $sent++;
            } else {
                $failed++;
                if (count($errors) < 5) {
                    $errors[] = ($customer->name ?: $mobile) . ': ' . ($result['message'] ?? 'failed');
                }
            }
        }

        return response()->json([
            'status' => 'done',
            'template' => $template->name,
            'matched' => $customers->count(),
            'sent_count' => $sent,
            'failed_count' => $failed,
            'invalid_count' => $invalid,
            'errors' => $errors,
        ]);
    }

    public function sendBulk(Request $request)
    {
        $data = $request->validate([
            'template_id' => 'nullable|integer|exists:whatsapp_templates,id',
            'template_name' => 'nullable|string|max:120',
            'fields' => 'nullable|array',
            'fields.*' => 'nullable|string|max:500',
            'phones' => 'nullable|string',
            'all_whatsapp_customers' => 'nullable|boolean',
        ]);

        $template = $this->resolveTemplate($data);
        if (!$template) {
            return response()->json(['message' => 'WhatsApp template not found.'], 422);
        }

        $targets = []; // mobile => customer_id

        if (!empty($data['all_whatsapp_customers'])) {
            Customer::select('id', 'phone_number')
                ->where('send_via', 'whatsapp')
                ->orderBy('id')
                ->limit(500)
                ->get()
                ->each(function ($customer) use (&$targets) {
                    $mobile = $this->normalizeMobile($customer->phone_number);
                    if ($mobile) {
                        $targets[$mobile] = $customer->id;
                    }
                });
        }

        if (!empty($data['phones'])) {
            $raw = preg_split('/[\s,;]+/', $data['phones']) ?: [];
            foreach ($raw as $piece) {
                $mobile = $this->normalizeMobile($piece);
                if ($mobile && !isset($targets[$mobile])) {
                    $targets[$mobile] = 0;
                }
            }
        }

        if (empty($targets)) {
            return response()->json(['message' => 'No valid recipients found.'], 422);
        }

        if (count($targets) > 200) {
            return response()->json(['message' => 'Max 200 recipients per bulk WhatsApp send.'], 422);
        }

        $sent = 0;
        $failed = 0;
        $errors = [];
        foreach ($targets as $mobile => $customerId) {
            $result = $this->dispatchTemplate($mobile, $template, $data['fields'] ?? [], $customerId ?: null);
            if (!empty($result['ok'])) {
                $sent++;
            } else {
                $failed++;
                if (count($errors) < 5) {
                    $errors[] = $mobile . ': ' . ($result['message'] ?? 'failed');
                }
            }
        }

        return response()->json([
            'status' => 'done',
            'template' => $template->name,
            'recipients' => count($targets),
            'sent_count' => $sent,
            'failed_count' => $failed,
            'errors' => $errors,
        ]);
    }

    public function report(Request $request)
    {
        $days = (int) $request->input('days', 30);
        if ($days < 1 || $days > 365) {
            $days = 30;
        }
        $since = Carbon::now()->subDays($days)->startOfDay();

        $byStatus = WhatsappDetail::query()
            ->select('status', DB::raw('COUNT(*) as total'))
            ->where('created_at', '>=', $since)
            ->groupBy('status')
            ->pluck('total', 'status');

        $daily = WhatsappDetail::query()
            ->select(DB::raw('DATE(created_at) as day'), DB::raw('COUNT(*) as total'))
            ->where('created_at', '>=', $since)
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        $inbox = WhatsappDetail::query()
            ->where('created_at', '>=', $since)
            ->where('data->metadata->phone_number_id', config('whatsapp.from_phone_number_id'))
            ->count();

        $outbox = WhatsappDetail::query()
            ->where('created_at', '>=', $since)
            ->whereNull('data->metadata->phone_number_id')
            ->count();

        $failedRecent = WhatsappDetail::query()
            ->leftJoin('customers', 'whatsapp_details.customer_id', '=', 'customers.id')
            ->select('whatsapp_details.id', 'whatsapp_details.status', 'whatsapp_details.message_description', 'whatsapp_details.created_at', 'customers.name')
            ->where('whatsapp_details.status', 'failed')
            ->where('whatsapp_details.created_at', '>=', $since)
            ->orderByDesc('whatsapp_details.id')
            ->limit(25)
            ->get();

        $sent = (int) ($byStatus['sent'] ?? 0) + (int) ($byStatus['delivered'] ?? 0) + (int) ($byStatus['read'] ?? 0);
        $failed = (int) ($byStatus['failed'] ?? 0);
        $total = (int) array_sum($byStatus->all());

        return response()->json([
            'days' => $days,
            'since' => $since->toDateString(),
            'account' => $this->fetchWhatsappAccount(),
            'totals' => [
                'all' => $total,
                'sent' => $sent,
                'failed' => $failed,
                'inbox' => $inbox,
                'outbox' => $outbox,
                'by_status' => $byStatus,
            ],
            'success_rate' => ($sent + $failed) > 0
                ? round(($sent / ($sent + $failed)) * 100, 1)
                : null,
            'daily' => $daily,
            'failed_recent' => $failedRecent,
            'templates' => WhatsappTemplate::where('status', 'APPROVED')->count(),
        ]);
    }

    private function fetchWhatsappAccount(): array
    {
        $token = config('whatsapp.access_token');
        $phoneId = config('whatsapp.from_phone_number_id');
        if (!$token || !$phoneId) {
            return [
                'ok' => false,
                'error' => 'WhatsApp API credentials are not configured',
            ];
        }

        try {
            $response = Http::withToken($token)
                ->timeout(12)
                ->get(rtrim(config('whatsapp.api_uri'), '/') . '/' . $phoneId, [
                    'fields' => 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status',
                ]);
            $json = $response->json() ?: [];
            if ($response->successful() && empty($json['error'])) {
                return [
                    'ok' => true,
                    'display_phone_number' => $json['display_phone_number'] ?? null,
                    'verified_name' => $json['verified_name'] ?? null,
                    'quality_rating' => $json['quality_rating'] ?? null,
                    'messaging_limit_tier' => $json['messaging_limit_tier'] ?? null,
                    'name_status' => $json['name_status'] ?? null,
                ];
            }
            return [
                'ok' => false,
                'error' => $json['error']['message'] ?? 'Failed to load WhatsApp account status',
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    private function resolveTemplate(array $data): ?WhatsappTemplate
    {
        if (!empty($data['template_id'])) {
            return WhatsappTemplate::find($data['template_id']);
        }
        if (!empty($data['template_name'])) {
            $waba = config('whatsapp.whatsapp_business_account_id');
            $q = WhatsappTemplate::where('name', $data['template_name']);
            if ($waba) {
                $q->where(function ($inner) use ($waba) {
                    $inner->where('whatsapp_business_account_id', $waba)
                        ->orWhereNull('whatsapp_business_account_id');
                });
            }
            return $q->orderByDesc('id')->first();
        }
        return null;
    }

    private function templateParamCount(WhatsappTemplate $template): int
    {
        $body = $template->body;
        $text = is_array($body) || is_object($body)
            ? json_encode($body)
            : (string) $body;
        if (preg_match_all('/\{\{(\d+)\}\}/', $text, $m)) {
            return count(array_unique($m[1]));
        }
        return 0;
    }

    private function buildTemplateComponents(array $fields): array
    {
        $fields = array_values(array_filter(array_map(fn ($f) => trim((string) $f), $fields), fn ($f) => $f !== ''));
        if (empty($fields)) {
            return [];
        }
        $parameters = [];
        foreach ($fields as $field) {
            $parameters[] = ['type' => 'text', 'text' => $field];
        }
        return [[
            'type' => 'body',
            'parameters' => $parameters,
        ]];
    }

    private function dispatchTemplate(string $mobile, WhatsappTemplate $template, array $fields, ?int $customerId): array
    {
        $components = $this->buildTemplateComponents($fields);
        $description = $template->name;
        if (!empty($fields)) {
            $description .= ' · ' . implode(' | ', array_map('strval', $fields));
        }

        try {
            $response = send_whatsapp_message(
                $mobile,
                $template->name,
                $template->language ?: 'en',
                '',
                '',
                $components
            );
            $json = $response->json() ?: [];
            $ok = $response->successful() && empty($json['error']) && !empty($json['messages']);

            $row = new WhatsappDetail();
            $row->customer_id = $customerId ?: 0;
            $row->template_id = $template->id;
            $row->components = $components;
            $row->message_description = $description;
            if ($ok) {
                $row->contacts = $json['contacts'] ?? [];
                $row->messages = $json['messages'] ?? [];
                $row->status = 'sent';
                $row->data = $json;
            } else {
                $row->status = 'failed';
                $row->data = $json['error'] ?? $json;
            }
            $row->save();

            return [
                'ok' => $ok,
                'message' => $ok ? 'WhatsApp template sent' : ($json['error']['message'] ?? 'WhatsApp send failed'),
                'recipient' => $mobile,
                'id' => $row->id,
            ];
        } catch (CustomException $e) {
            return ['ok' => false, 'message' => $e->getMessage(), 'recipient' => $mobile];
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $e->getMessage(), 'recipient' => $mobile];
        }
    }

    private function dispatchText(string $mobile, string $text, ?int $customerId): array
    {
        $token = config('whatsapp.access_token');
        $phoneId = config('whatsapp.from_phone_number_id');
        if (!$token || !$phoneId) {
            return ['ok' => false, 'message' => 'WhatsApp API credentials are not configured', 'recipient' => $mobile];
        }

        try {
            $response = Http::withToken($token)->timeout(20)->post(
                rtrim(config('whatsapp.api_uri'), '/') . '/' . $phoneId . '/messages',
                [
                    'messaging_product' => 'whatsapp',
                    'to' => $mobile,
                    'type' => 'text',
                    'text' => ['preview_url' => false, 'body' => $text],
                ]
            );
            $json = $response->json() ?: [];
            $ok = $response->successful() && empty($json['error']) && !empty($json['messages']);

            $row = new WhatsappDetail();
            $row->customer_id = $customerId ?: 0;
            $row->message_description = $text;
            if ($ok) {
                $row->contacts = $json['contacts'] ?? [];
                $row->messages = $json['messages'] ?? [];
                $row->status = 'sent';
                $row->data = $json;
            } else {
                $row->status = 'failed';
                $row->data = $json['error'] ?? $json;
            }
            $row->save();

            return [
                'ok' => $ok,
                'message' => $ok
                    ? 'WhatsApp message sent'
                    : ($json['error']['message'] ?? 'WhatsApp send failed (session messages require an open 24h window)'),
                'recipient' => $mobile,
                'id' => $row->id,
            ];
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $e->getMessage(), 'recipient' => $mobile];
        }
    }

    private function groupAudienceQuery(array $data)
    {
        $query = Customer::query()->active();

        $sendVia = $data['send_via'] ?? 'whatsapp';
        if ($sendVia !== 'all') {
            $query->where('send_via', $sendVia);
        }

        if (!empty($data['billing_type'])) {
            $billingType = (int) $data['billing_type'];
            $query->where(function ($q) use ($billingType) {
                $q->where('billing_type->value', $billingType)
                    ->orWhereHas('services', function ($sq) use ($billingType) {
                        $sq->where('billing_type->value', $billingType);
                    });
            });
        }

        if (!empty($data['category'])) {
            $query->where('category->value', (int) $data['category']);
        }

        if (isset($data['service_status']) && $data['service_status'] !== null && $data['service_status'] !== '') {
            $status = (int) $data['service_status'];
            $query->whereHas('services', function ($sq) use ($status) {
                $sq->where('status->value', $status);
            });
        }

        return $query;
    }

    private function normalizeMobile($mobile): ?string
    {
        $mobile = preg_replace('/\D/', '', (string) $mobile);
        if ($mobile === '') {
            return null;
        }
        if (preg_match('/^(07|01)\d{8}$/', $mobile)) {
            return '254' . substr($mobile, 1);
        }
        if (preg_match('/^254\d{9}$/', $mobile)) {
            return $mobile;
        }
        if (preg_match('/^\d{9}$/', $mobile) && in_array($mobile[0], ['7', '1'], true)) {
            return '254' . $mobile;
        }
        return null;
    }
}
