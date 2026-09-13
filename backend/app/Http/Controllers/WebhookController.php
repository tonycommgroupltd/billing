<?php

namespace App\Http\Controllers;

use App\Models\MessageStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    public function handleMessageStatus(Request $request)
    {
        // Example expected payload from Twilio or any service
        $data = $request->all();
        
        // Log or inspect
        Log::info('Webhook received', $data);

        $messageId = $data['MessageSid'] ?? null;
        $status = $data['MessageStatus'] ?? null;

        if ($messageId && $status) {
            MessageStatus::where('external_id', $messageId)->update([
                'status' => $status,
            ]);

            return response()->json(['message' => 'Status updated'], 200);
        }

        return response()->json(['error' => 'Invalid data'], 400);
    }
}
