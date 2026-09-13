<?php

namespace App\Http\Controllers;

use App\Services\TicketsAuthService;
use Illuminate\Http\JsonResponse;

class TicketsAuthController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    /**
     * Exchange the current APP.TCOM session for a ticketing-system API token.
     */
    public function token(TicketsAuthService $ticketsAuth): JsonResponse
    {
        $user = auth()->user();
        $ticketsToken = $ticketsAuth->tokenForUser($user);

        if (!$ticketsToken) {
            return response()->json([
                'success' => false,
                'error' => 'Could not resolve ticketing user. Check TICKETS_DB_* configuration.',
            ], 503);
        }

        return response()->json([
            'success' => true,
            'tickets_token' => $ticketsToken,
        ]);
    }
}
