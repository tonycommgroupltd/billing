<?php

namespace App\Http\Controllers;

use App\Models\InAppNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class NotificationController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    public function index(Request $request)
    {
        $user = auth()->user();
        $userId = (int) auth()->id();
        $rows = collect();
        $unread = 0;

        if (Schema::hasTable('notifications')) {
            $rows = InAppNotification::query()
                ->where('user_id', $userId)
                ->orderByDesc('created_at')
                ->limit(50)
                ->get()
                ->map(fn (InAppNotification $row) => [
                    'id' => $row->id,
                    'user_id' => $row->user_id,
                    'type' => $row->type,
                    'title' => $row->title,
                    'message' => $row->message,
                    'icon' => $row->icon,
                    'link' => $row->link,
                    'is_read' => $row->is_read ? 1 : 0,
                    'created_at' => optional($row->created_at)->toDateTimeString(),
                ]);

            $unread = InAppNotification::query()
                ->where('user_id', $userId)
                ->where('is_read', false)
                ->count();
        }

        // Ticket mutations are written by the PHP tickets API into the tickets DB
        // using *tickets* users.id. Contabo APP.TCOM auth uses Laravel tonycomm
        // users.id — map by email so the header bell can see them.
        // Skip ticket merge for roles that should not see ticket noise (e.g. finance-only).
        try {
            if (
                $this->userWantsTicketNotifications($user)
                && Schema::connection('tickets')->hasTable('notifications')
            ) {
                $ticketUserIds = $this->resolveTicketsUserIds($user, $userId);

                if (!empty($ticketUserIds)) {
                    $ticketRows = DB::connection('tickets')
                        ->table('notifications')
                        ->whereIn('user_id', $ticketUserIds)
                        ->where('type', 'ticket')
                        ->orderByDesc('created_at')
                        ->limit(50)
                        ->get()
                        ->map(fn ($row) => [
                            'id' => 'ticket-' . $row->id,
                            'user_id' => $row->user_id,
                            'type' => $row->type,
                            'title' => $row->title,
                            'message' => $row->message,
                            'icon' => $row->icon,
                            'link' => $row->link,
                            'is_read' => $row->is_read ? 1 : 0,
                            'created_at' => $row->created_at,
                        ]);

                    $rows = $rows
                        ->concat($ticketRows)
                        ->sortByDesc('created_at')
                        ->take(50)
                        ->values();

                    $unread += DB::connection('tickets')
                        ->table('notifications')
                        ->whereIn('user_id', $ticketUserIds)
                        ->where('type', 'ticket')
                        ->where('is_read', false)
                        ->count();
                }
            }
        } catch (\Throwable $e) {
            Log::warning('[notifications] tickets merge failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'data' => $rows,
            'unread' => $unread,
        ]);
    }

    public function markRead(string $id)
    {
        $user = auth()->user();
        $userId = (int) auth()->id();

        if (str_starts_with($id, 'ticket-')) {
            $ticketId = (int) substr($id, strlen('ticket-'));
            try {
                if ($ticketId && Schema::connection('tickets')->hasTable('notifications')) {
                    $ticketUserIds = $this->resolveTicketsUserIds($user, $userId);
                    $query = DB::connection('tickets')
                        ->table('notifications')
                        ->where('id', $ticketId);
                    if (!empty($ticketUserIds)) {
                        $query->whereIn('user_id', $ticketUserIds);
                    } else {
                        $query->where('user_id', $userId);
                    }
                    $query->update(['is_read' => true]);
                }
            } catch (\Throwable $e) {
                Log::warning('[notifications] ticket markRead failed: ' . $e->getMessage());
            }
        } elseif (Schema::hasTable('notifications')) {
            InAppNotification::query()
                ->where('id', (int) $id)
                ->where('user_id', $userId)
                ->update(['is_read' => true]);
        }

        return response()->json(['success' => true]);
    }

    public function markAllRead()
    {
        $user = auth()->user();
        $userId = (int) auth()->id();

        if (Schema::hasTable('notifications')) {
            InAppNotification::query()
                ->where('user_id', $userId)
                ->where('is_read', false)
                ->update(['is_read' => true]);
        }

        try {
            if (
                $this->userWantsTicketNotifications($user)
                && Schema::connection('tickets')->hasTable('notifications')
            ) {
                $ticketUserIds = $this->resolveTicketsUserIds($user, $userId);
                if (!empty($ticketUserIds)) {
                    DB::connection('tickets')
                        ->table('notifications')
                        ->whereIn('user_id', $ticketUserIds)
                        ->where('type', 'ticket')
                        ->where('is_read', false)
                        ->update(['is_read' => true]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('[notifications] ticket markAllRead failed: ' . $e->getMessage());
        }

        return response()->json(['success' => true]);
    }

    /**
     * Ticket bells are for ops / field staff — not finance-only or map-only roles.
     */
    private function userWantsTicketNotifications($user): bool
    {
        try {
            $names = method_exists($user, 'getRoleNames')
                ? $user->getRoleNames()->map(fn ($n) => strtolower((string) $n))->all()
                : [];
        } catch (\Throwable $e) {
            return true;
        }

        if ($names === []) {
            return true;
        }

        $ticketRoles = [
            'super-administrator',
            'administrator',
            'manager',
            'customer-care',
            'technician',
            'engineer',
            'ticket-creater',
            'ict',
        ];

        foreach ($names as $name) {
            if (in_array($name, $ticketRoles, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Tickets DB and Laravel billing DB are different ("tonycommgroupltd_db" vs
     * "tonycomm"). Match the logged-in staff member by email so ticket bells show.
     *
     * @return list<int>
     */
    private function resolveTicketsUserIds($user, int $laravelUserId): array
    {
        $ids = [];
        // Keep Laravel id in case some older rows were written with it.
        if ($laravelUserId > 0) {
            $ids[] = $laravelUserId;
        }

        $email = trim((string) ($user->email ?? ''));
        if ($email === '') {
            return array_values(array_unique($ids));
        }

        try {
            if (!Schema::connection('tickets')->hasTable('users')) {
                return array_values(array_unique($ids));
            }

            $ticketIds = DB::connection('tickets')
                ->table('users')
                ->whereRaw('LOWER(email) = ?', [strtolower($email)])
                ->when(
                    Schema::connection('tickets')->hasColumn('users', 'deleted_at'),
                    fn ($q) => $q->whereNull('deleted_at')
                )
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->filter()
                ->all();

            foreach ($ticketIds as $id) {
                $ids[] = $id;
            }
        } catch (\Throwable $e) {
            Log::warning('[notifications] resolveTicketsUserIds failed: ' . $e->getMessage());
        }

        return array_values(array_unique($ids));
    }
}
