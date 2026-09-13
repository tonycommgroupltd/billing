<?php

namespace App\Http\Controllers;

use App\Models\DeletionRequest;
use Illuminate\Http\Request;

class DeletionRequestController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $status = $request->query('status', 'pending');
        $mine = $request->boolean('mine') || $request->is('*/my-deletion-requests');

        $q = DeletionRequest::query()
            ->with(['requester:id,name,email', 'reviewer:id,name,email'])
            ->orderByDesc('id');

        if ($mine || !$user->hasRole('super-administrator')) {
            $q->where('requested_by', $user->id);
        }

        if ($status && $status !== 'all') {
            $q->where('status', $status);
        }

        $perPage = min(100, max(10, (int) $request->query('per_page', 25)));

        return response()->json($q->paginate($perPage));
    }

    public function approve(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->hasRole('super-administrator')) {
            return response()->json(['message' => 'Only Super Admin can approve deletions'], 403);
        }

        $dr = DeletionRequest::find($id);
        if (!$dr) {
            return response()->json(['message' => 'Deletion request not found'], 404);
        }
        if ($dr->status !== 'pending') {
            return response()->json(['message' => 'Request is not pending'], 422);
        }

        $dr->forceFill([
            'status' => 'approved',
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
            'review_note' => $request->input('note'),
        ])->save();

        $path = '/' . ltrim($dr->request_path, '/');
        $sub = Request::create($path, 'DELETE');
        $sub->headers->set('Accept', 'application/json');
        $sub->headers->set('X-Deletion-Approval-Id', (string) $dr->id);
        if ($auth = $request->header('Authorization')) {
            $sub->headers->set('Authorization', $auth);
        }
        $sub->setUserResolver(static fn () => $user);

        /** @var \Illuminate\Http\Response|\Illuminate\Http\JsonResponse $response */
        $response = app()->handle($sub);

        $payload = method_exists($response, 'getContent') ? json_decode($response->getContent(), true) : null;
        $status = $response->getStatusCode();

        $dr->refresh();

        return response()->json([
            'message' => $status < 400
                ? 'Deletion approved and executed'
                : 'Approved but delete execution returned an error',
            'deletion_request' => $dr->load(['requester:id,name,email', 'reviewer:id,name,email']),
            'execution_status' => $status,
            'execution_result' => $payload,
        ], $status < 400 ? 200 : 502);
    }

    public function reject(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->hasRole('super-administrator')) {
            return response()->json(['message' => 'Only Super Admin can reject deletions'], 403);
        }

        $dr = DeletionRequest::find($id);
        if (!$dr) {
            return response()->json(['message' => 'Deletion request not found'], 404);
        }
        if ($dr->status !== 'pending') {
            return response()->json(['message' => 'Request is not pending'], 422);
        }

        $dr->forceFill([
            'status' => 'rejected',
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
            'review_note' => $request->input('note') ?: 'Rejected by Super Admin',
        ])->save();

        return response()->json([
            'message' => 'Deletion request rejected',
            'deletion_request' => $dr->load(['requester:id,name,email', 'reviewer:id,name,email']),
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $user = $request->user();
        $dr = DeletionRequest::find($id);
        if (!$dr) {
            return response()->json(['message' => 'Deletion request not found'], 404);
        }
        if ((int) $dr->requested_by !== (int) $user->id && !$user->hasRole('super-administrator')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($dr->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be cancelled'], 422);
        }

        $dr->forceFill([
            'status' => 'cancelled',
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
            'review_note' => $request->input('note') ?: 'Cancelled by requester',
        ])->save();

        return response()->json([
            'message' => 'Deletion request cancelled',
            'deletion_request' => $dr,
        ]);
    }
}
