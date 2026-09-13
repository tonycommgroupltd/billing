<?php

namespace App\Http\Controllers\Api\v1\Portal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api', ['except' => ['register']]);
    }

    public function register(Request $request)
    {
        try {
            // Normalize phone first
            $normalizedPhone = $this->normalizePhone($request->input('phone_number'));
            // Validate payload
            $validator = Validator::make(
                array_merge($request->all(), ['phone_number' => $normalizedPhone]),
                [
                    'firstName' => 'required|string|max:255',
                    'lastName'  => 'required|string|max:255',
                    'phone_number'     => 'required|string|max:13|unique:customers,phone_number',
                    //'email'     => 'required|email|max:255|unique:customers,email',
                ]
            );

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors' => $validator->errors(),
                ], 422);
            }
            // Create customer
            $customer = Customer::create([
                'name' => $request->input('firstName') . ' ' . $request->input('lastName'),
                'phone_number'      => $normalizedPhone,
                //'email'      => $request->input('email'),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Customer registered successfully',
                'data'    => $customer,
            ]);
        } catch (\Exception $e) {
            Log::error("Error registering for {$normalizedPhone}: " . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Error occurred during registration. Please try again.',
            ], 500);
        }
    }

    private function normalizePhone(string $phone): string
    {
        // Remove non-digit characters
        $digits = preg_replace('/\D/', '', $phone);

        // Take last 9 digits (Kenya)
        return "0" . substr($digits, -9);
    }
}
