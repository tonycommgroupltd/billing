<?php

namespace App\Http\Controllers\Api\v1\Portal;

use App\Http\Controllers\Controller;
use App\Messages\OtpMessage;
use App\Models\Customer;
use App\Models\MessageTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Tymon\JWTAuth\Facades\JWTAuth;

class OtpController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api', ['except' => ['requestOtp', 'verifyOtp']]);
    }
    /**
     * Request OTP
     */
    public function requestOtp(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', 'min:6'],
        ]);

        $phone = $request->input('phone');

        try {
            $customer = $this->findCustomerByPhone($phone);
            if (!$customer) {
                return response()->json([
                    'success' => false,
                    'message' => 'Phone number not registered',
                ], 404);
            }
            // Generate 6-digit OTP
            $otpCode = random_int(100000, 999999);

            // Store OTP in Redis with TTL (5 minutes)
            $ttl = 300; // seconds
            $redisKey = "otp:{$customer->phone_number}";
            Redis::setex($redisKey, $ttl, $otpCode);

            // Optionally log or send via SMS provider
            //Log::info("OTP for {$customer->phone_number}: {$otpCode}");
            $contentVars = [
                'en' => [ //Optional wrap with locale
                    'otp' => $otpCode
                ],
            ];

            $message = new OtpMessage($contentVars, 'send_otp');
            $body = $message->renderMessage();
            $template = MessageTemplate::where('message_class', 'send_otp')->first();
            send_sms($customer->formatted_phone_no, $body, $customer->id, $contentVars, $template->id);

            return response()->json([
                'success' => true,
                'message' => 'OTP sent successfully',
                'expires_in' => $ttl, // seconds
            ]);
        } catch (\Exception $e) {
            Log::error("Error generating OTP for {$phone}: " . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Failed to generate OTP. Please try again.',
            ], 500);
        }
    }

    /**
     * Verify OTP
     */
    public function verifyOtp(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string'],
            'otp' => ['required', 'string'],
        ]);

        $phone = $request->input('phone');
        $otpInput = $request->input('otp');

        $customer = $this->findCustomerByPhone($phone);
        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Phone number not registered',
            ], 404);
        }

        $redisKey = "otp:{$customer->phone_number}";
        //$redisKey = config('database.redis.options.prefix') . "otp:$phone";

        $otpStored = Redis::get($redisKey);

        if (!$otpStored) {
            return response()->json([
                'success' => false,
                'message' => 'OTP expired or not found.'
            ]);
        }

        if ($otpStored !== $otpInput) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid OTP.',
            ]);
        }

        // OTP is valid → delete from Redis
        Redis::del($redisKey);

        $token = JWTAuth::fromUser($customer);

        return response()->json([
            'success' => true,
            'message' => 'OTP verified successfully',
            'token' => $token,
            'user' => $customer
        ]);
    }

    private function findCustomerByPhone(string $phone)
    {
        // Normalize phone (keep last 9 digits, e.g., 712345678)
        $normalized = substr(preg_replace('/\D/', '', $phone), -9);

        // Search Customer model
        return Customer::whereRaw("RIGHT(phone_number, 9) = ?", [$normalized])->first();
    }
}
