<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class InternalServerLogsAuth
{
    public function handle(Request $request, Closure $next)
    {
        $expected = config('ha.server_logs_peer_key');
        $provided = $request->header('X-Server-Logs-Key');

        if ($expected && $provided && hash_equals((string) $expected, (string) $provided)) {
            return $next($request);
        }

        if (auth('api')->check()) {
            $user = auth('api')->user();
            if ($user && $user->hasAnyRole(['super-administrator', 'ict', 'administrator'])) {
                return $next($request);
            }
        }

        return response()->json(['message' => 'Unauthorized'], 401);
    }
}
