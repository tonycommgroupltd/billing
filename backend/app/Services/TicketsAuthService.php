<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TicketsAuthService
{
    private const TOKEN_TTL_DAYS = 7;

    /**
     * Issue a ticketing-system token for an authenticated APP.TCOM (Laravel) user.
     * Finds or creates the matching user in tonycommgroupltd_db and returns the
     * same base64 JSON token format used by tickets.tonycommgroupltd.com/api.
     */
    public function tokenForUser(User $user): ?string
    {
        try {
            $freshUser = User::query()->find($user->id);
            if (!$freshUser) {
                return null;
            }

            $ticketsUserId = $this->resolveTicketsUserId($freshUser);
            if (!$ticketsUserId) {
                return null;
            }

            return $this->generateTicketsToken($ticketsUserId);
        } catch (\Throwable $e) {
            Log::warning('TicketsAuthService: unable to issue tickets token', [
                'user_id' => $user->id,
                'email' => $user->email,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    private function generateTicketsToken(int $userId): string
    {
        $payload = [
            'user_id' => $userId,
            'iat' => time(),
            'exp' => time() + (self::TOKEN_TTL_DAYS * 24 * 3600),
        ];

        return base64_encode(json_encode($payload));
    }

    private function resolveTicketsUserId(User $user): ?int
    {
        $connection = DB::connection('tickets');

        $existing = $this->findTicketsUser($connection, $user);
        if ($existing) {
            $this->syncPasswordHash($connection, (int) $existing->id, $user->password);
            $this->syncRoles($connection, (int) $existing->id, $user);
            return (int) $existing->id;
        }

        return $this->createTicketsUser($connection, $user);
    }

    private function findTicketsUser($connection, User $user): ?object
    {
        $email = trim((string) $user->email);
        $phone = trim((string) $user->phone);
        $name = trim((string) $user->name);

        if ($email !== '') {
            $row = $connection->table('users')
                ->whereNull('deleted_at')
                ->where('email', $email)
                ->first();
            if ($row) {
                return $row;
            }
        }

        if ($phone !== '') {
            $digits = preg_replace('/\D/', '', $phone);
            $tail = substr($digits, -9);

            $row = $connection->table('users')
                ->whereNull('deleted_at')
                ->where(function ($query) use ($phone, $digits, $tail) {
                    $query->where('phone', $phone)
                        ->orWhere('phone', $digits)
                        ->orWhereRaw(
                            "RIGHT(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), 9) = ?",
                            [$tail]
                        );
                })
                ->first();
            if ($row) {
                return $row;
            }
        }

        if ($name !== '') {
            $row = $connection->table('users')
                ->whereNull('deleted_at')
                ->where('name', $name)
                ->first();
            if ($row) {
                return $row;
            }
        }

        return null;
    }

    private function syncPasswordHash($connection, int $ticketsUserId, string $passwordHash): void
    {
        if ($passwordHash === '') {
            return;
        }

        $connection->table('users')
            ->where('id', $ticketsUserId)
            ->update([
                'password' => $passwordHash,
                'updated_at' => now(),
            ]);
    }

    private function createTicketsUser($connection, User $user): ?int
    {
        $now = now();

        $ticketsUserId = $connection->table('users')->insertGetId([
            'name' => $user->name,
            'email' => $user->email ?: null,
            'phone' => $user->phone ?: null,
            'password' => $user->password,
            'password_change_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->syncRoles($connection, (int) $ticketsUserId, $user);

        return (int) $ticketsUserId;
    }

    private function syncRoles($connection, int $ticketsUserId, User $user): void
    {
        $roleNames = $user->all_roles ?? [];
        if (empty($roleNames)) {
            return;
        }

        $roleIds = $connection->table('roles')
            ->whereIn('name', $roleNames)
            ->whereIn('guard_name', ['api', 'web'])
            ->pluck('id')
            ->all();

        if (empty($roleIds)) {
            return;
        }

        $connection->table('model_has_roles')
            ->where('model_type', 'App\\Models\\User')
            ->where('model_id', $ticketsUserId)
            ->delete();

        foreach ($roleIds as $roleId) {
            $connection->table('model_has_roles')->insert([
                'role_id' => $roleId,
                'model_type' => 'App\\Models\\User',
                'model_id' => $ticketsUserId,
            ]);
        }
    }
}
