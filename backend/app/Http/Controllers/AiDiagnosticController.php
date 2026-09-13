<?php

namespace App\Http\Controllers;

use App\Services\GroqDiagnosticService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class AiDiagnosticController extends Controller
{
    public function ask(Request $request, GroqDiagnosticService $groq): JsonResponse
    {
        $validated = $request->validate([
            'question' => ['required', 'string', 'min:1', 'max:1500'],
            'history' => ['nullable', 'array', 'max:8'],
            'history.*.role' => ['required_with:history', 'string', 'in:user,assistant'],
            'history.*.content' => ['required_with:history', 'string', 'max:900'],
        ]);

        $question = trim($validated['question']);
        $history = $validated['history'] ?? [];

        Log::info('AI buddy asked', [
            'user_id' => auth()->id(),
            'question_len' => strlen($question),
            'history_turns' => count($history),
        ]);

        // Research agent + Groq retries often exceed default PHP-FPM 30s.
        @set_time_limit(180);
        @ini_set('max_execution_time', '180');

        try {
            $result = $groq->chat($question, $history);
        } catch (RuntimeException $exception) {
            report($exception);
            $status = (int) $exception->getCode();
            if ($status < 400 || $status > 599) {
                $status = 502;
            }

            return response()->json([
                'success' => false,
                'message' => $exception->getMessage(),
                'rate_limited' => $status === 429,
            ], $status);
        }

        return response()->json([
            'success' => true,
            'answer' => $result['answer'],
            'tools_used' => $result['tools_used'],
            'iterations' => $result['iterations'],
            'trace' => $result['trace'] ?? [],
            'generated_at' => now()->toIso8601String(),
        ]);
    }
}
