<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Messages\ResetPasswordMessage;
use App\Models\Customer;
use App\Models\MessageTemplate;
use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Services\TicketsAuthService;

class AuthController extends Controller
{
    /**
     * Create a new AuthController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api', ['except' => ['login', 'register', 'forgotPassword', 'resetPassword']]);
    }

    /**
     * Get a JWT via given credentials.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string',
            'password' => 'required|string|min:6',
        ]);
        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }
        //Log::info($validator->validated());
        $phone = $request->get('email');
        $password = $request->get('password');
        //$remember_me = $request->get('remember_me', '1');
        $field = filter_var($phone, FILTER_VALIDATE_EMAIL) ? 'email' : 'phone';
        if (!$token = auth()->setTTL(120)->attempt([$field => $phone, 'password' => $password])) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return $this->createNewToken($token);
    }
    /**
     * Register a User.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|between:2,100',
            'phone' => ['required', 'regex:/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/', 'unique:users', 'unique:customers,phone_number'],
            'email' => 'nullable|email|max:100|unique:users',
            'password' => 'required|string|confirmed|min:6',
        ]);
        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }
        $user = User::create(array_merge(
            $validator->validated(),
            ['password' => bcrypt($request->password)]
        ));

        if ($user) {
            Customer::create(['user_id' => $user->id, 'name' => $user->name, 'phone_number' => $user->phone]);
            $user->assignRole('customer');
        }
        return response()->json([
            'message' => 'User successfully registered',
            'user' => $user
        ], 201);
    }

    public function verifyPhone(Request $request)
    {
        $user = auth()->user();
        $otp = (new Otp)->validate($user->phone, $request->otp);
        if (!$otp->status) {
            $customValidator = ValidationException::withMessages([
                'otp' => $otp->message,
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        if ($request->user()->hasVerifiedPhone()) {
            return response()->json(['status' => 'Your phone is already verified!', 'user' => $user]);
        }

        $request->user()->markPhoneAsVerified();

        return response()->json(['status' => 'Your phone was successfully verified!', 'user' => $user]);
    }

    /**
     * Log the user out (Invalidate the token).
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function logout()
    {
        auth()->logout();
        return response()->json(['message' => 'User successfully signed out']);
    }
    /**
     * Refresh a token.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function refresh()
    {
        return $this->createNewToken(auth()->refresh());
    }
    /**
     * Get the authenticated User.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function userProfile()
    {
        return response()->json(auth()->user());
    }
    /**
     * Update the authenticated User.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function updateProfile(Request $request)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
        ];

        $validator = Validator::make($request->all(), [
            'name' => 'required|string',
            'email' => ['sometimes', 'email', 'unique:users,email,' . $request->user()->id],
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $request->user()->fill($request->all())->save();

        return response()->json([
            'status' => 'Profile updated',
            'user' => auth()->user()
        ], 200);
    }
    /**
     * Get the token array structure.
     *
     * @param  string $token
     *
     * @return \Illuminate\Http\JsonResponse
     */
    protected function createNewToken($token)
    {
        /*$user = auth()->user();
        if (!$user->hasVerifiedPhone() && $user->hasRole(['customer', 'reseller']) && $user->hasResetPassword()) {
            $this->callToVerify(auth()->user());
        }*/
        $ticketsToken = app(TicketsAuthService::class)->tokenForUser(auth()->user());

        return response()->json([
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => auth()->factory()->getTTL() * 60,
            'user' => auth()->user(),
            'tickets_token' => $ticketsToken,
        ]);
    }
    /**
     * Reset password.
     * 
     * @return \Illuminate\Http\JsonResponse
     */
    public function forgotPassword(Request $request)
    {
        /*$validator = Validator::make($request->all(), [
            'email' => 'required|email',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $status = Password::sendResetLink(
            $request->only('email')
        );

        if ($status != Password::RESET_LINK_SENT) {
            $customValidator = ValidationException::withMessages([
                'email' => [__($status)],
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        return response()->json(['status' => __($status)]);*/
        $validator = Validator::make($request->all(), [
            'phone' => 'required|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $user = User::where('phone', format_phone($request->phone))->first();
        if (!$user) {
            $customValidator = ValidationException::withMessages([
                'phone' => 'Invalid phone number!',
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        $password = Str::random(6);
        $token = (string) Str::uuid();
        $user->forceFill([
            'password' => Hash::make($password),
            'reset_token' => $token,
            'password_change_at' => NULL,
        ])->save();

        $contentVars = [
            'en' => [ //Optional wrap with locale
                'password' => $password,
            ],
        ];
        $customer_id = 0;
        $customer = Customer::where('user_id', $user->id)->first();
        if ($customer) $customer_id = $customer->id;

        $message = new ResetPasswordMessage($contentVars, 'reset_password');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'reset_password')->first();
        send_sms(format_phone($user->phone), $body, $customer_id, $contentVars, $template->id);

        return response()->json(['status' => 'OTP sent successfully to ' . Str::mask($user->phone, '*', 4, 3)]);
    }
    /**
     * New password.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function resetPassword(Request $request)
    {
        /*$validator = Validator::make($request->all(), [
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|confirmed|min:6',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user) use ($request) {
                $user->forceFill([
                    'password' => Hash::make($request->password),
                    'remember_token' => Str::random(60),
                ])->save();

                event(new PasswordReset($user));
            }
        );

        if ($status != Password::PASSWORD_RESET) {
            $customValidator = ValidationException::withMessages([
                'email' => [__($status)],
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        return response()->json(['status' => __($status)]);*/
        $validator = Validator::make($request->all(), [
            'token' => 'required',
            'password' => 'required|confirmed|min:6',
        ]);
        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }
        $user = User::where('reset_token', $request->token)->first();
        if (!$user && !$request->user()->hasResetPassword()) {
            $customValidator = ValidationException::withMessages([
                'token' => 'Invalid password reset link!',
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        $request->user()->markPasswordAsChanged();

        $request->user()->forceFill([
            'password' => Hash::make($request->password),
        ])->save();

        return response()->json(['status' => 'Your password was successfully reset!', 'user' => auth()->user()]);
    }

    public function callToVerify($user)
    {
        $otp = (new Otp)->generate($user->phone, 'numeric', 6, 15);
        $sms = "Use " . $otp->token . " as your one time pin for TonyComm. It will be active for the next 15 minutes";
        return send_sms($user->phone, $sms, $user->id);
    }
}
