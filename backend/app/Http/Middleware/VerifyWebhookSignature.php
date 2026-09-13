<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Illuminate\Support\Str;

class VerifyWebhookSignature
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */

    public function handle(Request $request, Closure $next): Response
    {
        if (
            empty($secret = config('whatsapp.app_secret')) ||
            empty($signature = $request->header('X-Hub-Signature-256')) ||
            !Str::startsWith($signature, 'sha256=') ||
            !hash_equals(hash_hmac('sha256', $request->getContent(), $secret), Str::after($signature, 'sha256='))
        ) {
            throw new AccessDeniedHttpException;
        }

        return $next($request);
    }
}
