<?php

namespace App\Http\Middleware;

use App\Models\DeletionRequest;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Non–super-administrators cannot DELETE directly.
 * Their DELETE becomes a pending deletion_request (HTTP 202).
 * Super Admin approves → replay with X-Deletion-Approval-Id.
 */
class InterceptDestructiveDeletes
{
    public function handle(Request $request, Closure $next): Response
    {
        if (strtoupper($request->method()) !== 'DELETE') {
            return $next($request);
        }

        // Never intercept the approvals API itself
        if ($request->is('api/v1/deletion-requests*') || $request->is('*/deletion-requests*')) {
            return $next($request);
        }

        $user = $request->user('api') ?? $request->user();

        // api-group middleware runs before controller auth:api — authenticate JWT here.
        if (!$user && $request->bearerToken()) {
            try {
                $user = auth('api')->user() ?: auth('api')->authenticate();
            } catch (\Throwable $e) {
                $user = null;
            }
        }

        if (!$user) {
            return $next($request);
        }

        if (method_exists($user, 'hasRole') && $user->hasRole('super-administrator')) {
            return $next($request);
        }

        $approvalId = $request->header('X-Deletion-Approval-Id');
        if ($approvalId) {
            $pending = DeletionRequest::query()
                ->where('id', $approvalId)
                ->whereIn('status', ['approved', 'completed'])
                ->first();

            if ($pending && $this->pathsMatch($pending->request_path, $request->path())) {
                if ($pending->status === 'completed' && $pending->executed_at) {
                    return response()->json([
                        'message' => 'This deletion was already executed',
                        'deletion_request_id' => $pending->id,
                    ], 409);
                }

                $request->attributes->set('deletion_request_id', $pending->id);
                $response = $next($request);

                if ($response->getStatusCode() < 400) {
                    $pending->forceFill([
                        'status' => 'completed',
                        'executed_at' => now(),
                    ])->save();
                }

                return $response;
            }

            return response()->json([
                'message' => 'Invalid or missing deletion approval',
            ], 403);
        }

        $path = $request->path();
        $existing = DeletionRequest::query()
            ->where('request_path', $path)
            ->where('status', 'pending')
            ->latest('id')
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'Delete request already pending Super Admin approval',
                'requires_approval' => true,
                'deletion_request' => $this->serialize($existing),
            ], 202);
        }

        [$type, $id, $label] = $this->guessResource($path);

        $created = DeletionRequest::create([
            'requested_by' => $user->id,
            'request_method' => 'DELETE',
            'request_path' => $path,
            'resource_type' => $type,
            'resource_id' => $id,
            'resource_label' => $label,
            'reason' => $request->input('reason') ?: $request->header('X-Deletion-Reason'),
            'status' => 'pending',
            'meta' => [
                'query' => $request->query(),
                'user_agent' => substr((string) $request->userAgent(), 0, 250),
            ],
        ]);

        return response()->json([
            'message' => 'Delete requires Super Admin approval. Your request was submitted.',
            'requires_approval' => true,
            'deletion_request' => $this->serialize($created),
        ], 202);
    }

    private function pathsMatch(string $stored, string $current): bool
    {
        return trim($stored, '/') === trim($current, '/');
    }

    private function guessResource(string $path): array
    {
        $parts = array_values(array_filter(explode('/', $path)));
        // api/v1/{resource}/{id}
        $resource = $parts[2] ?? ($parts[count($parts) - 2] ?? 'resource');
        $id = $parts[3] ?? ($parts[count($parts) - 1] ?? null);
        $label = ucfirst(str_replace('-', ' ', (string) $resource)) . ($id ? " #{$id}" : '');

        return [$resource, $id !== null ? (string) $id : null, $label];
    }

    private function serialize(DeletionRequest $r): array
    {
        return [
            'id' => $r->id,
            'status' => $r->status,
            'resource_type' => $r->resource_type,
            'resource_id' => $r->resource_id,
            'resource_label' => $r->resource_label,
            'request_path' => $r->request_path,
            'created_at' => optional($r->created_at)->toIso8601String(),
        ];
    }
}
