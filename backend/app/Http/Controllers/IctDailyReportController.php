<?php

namespace App\Http\Controllers;

use App\Models\IctDailyReport;
use App\Models\IctDailyReportRouter;
use App\Models\Router;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class IctDailyReportController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    public function index(Request $request)
    {
        $perPage = min(60, max(10, (int) $request->query('per_page', 20)));
        $q = IctDailyReport::query()->orderByDesc('report_date');

        if ($request->filled('from')) {
            $q->whereDate('report_date', '>=', $request->query('from'));
        }
        if ($request->filled('to')) {
            $q->whereDate('report_date', '<=', $request->query('to'));
        }
        if ($request->filled('status')) {
            $q->where('overall_status', $request->query('status'));
        }

        return response()->json(
            $q->with(['submitter:id,name', 'updater:id,name'])
                ->paginate($perPage)
        );
    }

    public function show(Request $request, $date = null)
    {
        $day = $this->resolveDate($date ?? $request->query('date'));
        $report = $this->findOrCreateForDate($day, $request->user());

        return response()->json([
            'report' => $this->present($report),
        ]);
    }

    public function save(Request $request, $date = null)
    {
        $day = $this->resolveDate($date ?? $request->input('date'));
        $report = $this->findOrCreateForDate($day, $request->user());

        if ($report->overall_status === 'submitted' && !$request->user()->hasRole('super-administrator')) {
            return response()->json([
                'message' => 'Report already submitted. Ask Super Admin to reopen it.',
            ], 422);
        }

        $userId = $request->user()->id;
        $now = now();

        DB::transaction(function () use ($request, $report, $userId, $now) {
            $data = [
                'updated_by' => $userId,
            ];

            foreach (['summary_status', 'summary_notes', 'issues_followups'] as $field) {
                if ($request->exists($field)) {
                    $data[$field] = $request->input($field);
                }
            }

            foreach (['radius', 'sms', 'system'] as $section) {
                $statusKey = "{$section}_status";
                $notesKey = "{$section}_notes";
                if ($request->exists($statusKey) || $request->exists($notesKey)) {
                    if ($request->exists($statusKey)) {
                        $data[$statusKey] = $request->input($statusKey);
                    }
                    if ($request->exists($notesKey)) {
                        $data[$notesKey] = $request->input($notesKey);
                    }
                    // Stamp check time whenever section status/notes change
                    if (in_array($request->input($statusKey), ['ok', 'issue'], true)
                        || ($request->exists($statusKey) && $request->input($statusKey))) {
                        $data["{$section}_checked_at"] = $now;
                        $data["{$section}_checked_by"] = $userId;
                    }
                }
            }

            if ($report->overall_status === 'draft') {
                $data['overall_status'] = 'in_progress';
            }

            $report->fill($data)->save();

            $routers = $request->input('routers');
            if (is_array($routers)) {
                foreach ($routers as $row) {
                    $routerId = (int) ($row['router_id'] ?? 0);
                    if (!$routerId) {
                        continue;
                    }
                    $check = IctDailyReportRouter::query()
                        ->where('report_id', $report->id)
                        ->where('router_id', $routerId)
                        ->first();
                    if (!$check) {
                        continue;
                    }
                    $status = $row['status'] ?? $check->status;
                    $notes = array_key_exists('notes', $row) ? $row['notes'] : $check->notes;
                    $changed = $status !== $check->status || $notes !== $check->notes;
                    $check->status = $status;
                    $check->notes = $notes;
                    if ($changed && in_array($status, ['ok', 'issue'], true)) {
                        $check->checked_at = $now;
                        $check->checked_by = $userId;
                    }
                    $check->save();
                }
            }
        });

        $report->refresh()->load(['routerChecks', 'updater:id,name', 'submitter:id,name']);

        return response()->json([
            'message' => 'Report saved',
            'report' => $this->present($report),
        ]);
    }

    public function submit(Request $request, $date = null)
    {
        $day = $this->resolveDate($date ?? $request->input('date'));
        $report = $this->findOrCreateForDate($day, $request->user());
        $report->load('routerChecks');

        $pendingRouters = $report->routerChecks->where('status', 'pending')->count();
        $missing = [];
        if ($pendingRouters > 0) {
            $missing[] = "{$pendingRouters} router check(s) still pending";
        }
        foreach (['radius_status' => 'RADIUS', 'sms_status' => 'SMS', 'system_status' => 'Full system'] as $field => $label) {
            if (!in_array($report->{$field}, ['ok', 'issue'], true)) {
                $missing[] = "{$label} section not completed";
            }
        }

        if ($missing && !$request->boolean('force')) {
            return response()->json([
                'message' => 'Report incomplete',
                'missing' => $missing,
            ], 422);
        }

        $hasIssue = $report->summary_status === 'issue'
            || $report->radius_status === 'issue'
            || $report->sms_status === 'issue'
            || $report->system_status === 'issue'
            || $report->routerChecks->contains(fn ($r) => $r->status === 'issue');

        if (!$report->summary_status) {
            $report->summary_status = $hasIssue ? 'issue' : 'ok';
        }

        $report->forceFill([
            'overall_status' => 'submitted',
            'submitted_by' => $request->user()->id,
            'submitted_at' => now(),
            'updated_by' => $request->user()->id,
        ])->save();

        return response()->json([
            'message' => 'Daily ICT report submitted',
            'report' => $this->present($report->fresh()->load(['routerChecks', 'submitter:id,name', 'updater:id,name'])),
        ]);
    }

    public function reopen(Request $request, $date = null)
    {
        if (!$request->user()->hasRole('super-administrator')) {
            return response()->json(['message' => 'Only Super Admin can reopen a submitted report'], 403);
        }

        $day = $this->resolveDate($date ?? $request->input('date'));
        $report = IctDailyReport::whereDate('report_date', $day)->first();
        if (!$report) {
            return response()->json(['message' => 'Report not found'], 404);
        }

        $report->forceFill([
            'overall_status' => 'in_progress',
            'submitted_at' => null,
            'submitted_by' => null,
            'updated_by' => $request->user()->id,
        ])->save();

        return response()->json([
            'message' => 'Report reopened',
            'report' => $this->present($report->fresh()->load(['routerChecks', 'updater:id,name'])),
        ]);
    }

    private function resolveDate($date): Carbon
    {
        try {
            return $date ? Carbon::parse($date)->startOfDay() : now()->startOfDay();
        } catch (\Throwable $e) {
            return now()->startOfDay();
        }
    }

    private function findOrCreateForDate(Carbon $day, $user): IctDailyReport
    {
        $report = IctDailyReport::whereDate('report_date', $day)->first();
        if ($report) {
            $this->syncRouterRows($report);
            return $report->load(['routerChecks', 'updater:id,name', 'submitter:id,name', 'creator:id,name']);
        }

        $report = IctDailyReport::create([
            'report_date' => $day->toDateString(),
            'overall_status' => 'draft',
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);
        $this->syncRouterRows($report);

        return $report->load(['routerChecks', 'updater:id,name', 'submitter:id,name', 'creator:id,name']);
    }

    private function syncRouterRows(IctDailyReport $report): void
    {
        $routers = Router::query()->orderBy('title')->get(['id', 'title', 'host']);
        $existing = IctDailyReportRouter::where('report_id', $report->id)->pluck('router_id')->all();

        foreach ($routers as $router) {
            if (in_array($router->id, $existing, true)) {
                continue;
            }
            IctDailyReportRouter::create([
                'report_id' => $report->id,
                'router_id' => $router->id,
                'router_title' => $router->title ?: ($router->host ?: "Router #{$router->id}"),
                'status' => 'pending',
            ]);
        }
    }

    private function present(IctDailyReport $report): array
    {
        $routers = $report->routerChecks->map(function (IctDailyReportRouter $r) {
            return [
                'id' => $r->id,
                'router_id' => $r->router_id,
                'router_title' => $r->router_title,
                'status' => $r->status,
                'notes' => $r->notes,
                'checked_at' => optional($r->checked_at)->toIso8601String(),
                'checked_by' => $r->checked_by,
            ];
        })->values();

        $okRouters = $routers->where('status', 'ok')->count();
        $issueRouters = $routers->where('status', 'issue')->count();
        $pendingRouters = $routers->where('status', 'pending')->count();

        return [
            'id' => $report->id,
            'report_date' => optional($report->report_date)->toDateString(),
            'overall_status' => $report->overall_status,
            'summary_status' => $report->summary_status,
            'summary_notes' => $report->summary_notes,
            'radius_status' => $report->radius_status,
            'radius_notes' => $report->radius_notes,
            'radius_checked_at' => optional($report->radius_checked_at)->toIso8601String(),
            'sms_status' => $report->sms_status,
            'sms_notes' => $report->sms_notes,
            'sms_checked_at' => optional($report->sms_checked_at)->toIso8601String(),
            'system_status' => $report->system_status,
            'system_notes' => $report->system_notes,
            'system_checked_at' => optional($report->system_checked_at)->toIso8601String(),
            'issues_followups' => $report->issues_followups,
            'submitted_at' => optional($report->submitted_at)->toIso8601String(),
            'created_by' => $report->created_by,
            'updated_by' => $report->updated_by,
            'submitted_by' => $report->submitted_by,
            'updater' => $report->updater,
            'submitter' => $report->submitter,
            'routers' => $routers,
            'progress' => [
                'routers_ok' => $okRouters,
                'routers_issue' => $issueRouters,
                'routers_pending' => $pendingRouters,
                'routers_total' => $routers->count(),
            ],
        ];
    }
}
