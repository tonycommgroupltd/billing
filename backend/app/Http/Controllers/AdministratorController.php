<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Http\Resources\UserCollection;
use App\Messages\AdminWelcomeMessage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Validator;
use Illuminate\Support\Str;

class AdministratorController extends Controller
{
    /**
     * Create a new RoleController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $user = User::find($id);

        return response()->json([
            'user' => $user
        ], 200);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|between:2,100',

            'email' => 'nullable|required_without:phone|email|max:100',

            'phone' => 'nullable|required_without:email|string',

            'role' => 'required|string',
        ], [
            'email.required_without' => 'Email or phone is required.',
            'phone.required_without' => 'Phone or email is required.',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        DB::beginTransaction();

        try {
            $user = User::query()
                ->where(function ($q) use ($request) {
                    if ($request->phone && $request->email) {
                        $q->where('phone', $request->phone)
                            ->orWhere('email', $request->email);
                    } elseif ($request->phone) {
                        $q->where('phone', $request->phone);
                    } elseif ($request->email) {
                        $q->where('email', $request->email);
                    }
                })
                ->first();

            if ($user) {
                $lockedRoles = ['super-administrator', 'ict', 'administrator', 'customer-care', 'manager', 'customer-creator', 'engineer', 'financial-manager', 'technician'];

                if ($user->hasAnyRole($lockedRoles)) {
                    return response()->json([
                        'message' => ['User already exists'],
                        'errors' => [
                            'phone' => ['User already exists']
                        ]
                    ], 422);
                }

                if ($request->name) {
                    $user->name = $request->name;
                }

                if ($request->email) {
                    $user->email = $request->email;
                }

                if ($request->phone) {
                    $user->phone = $request->phone;
                }

                $password = Str::random(6);
                $token = (string) Str::uuid();
                $user->forceFill([
                    'password' => Hash::make($password),
                    'reset_token' => $token,
                    'password_change_at' => NULL,
                ])->save();

                /*
                |--------------------------------------------------------------------------
                | Sync Roles
                |--------------------------------------------------------------------------
                */

                $user->syncRoles([$request->role]);

                if ($user->phone) {
                    $contentVars = [
                        'en' => [ //Optional wrap with locale
                            'first_name' => explode(' ', trim($request->name))[0],
                            'admin_login' => $user->phone,
                            'admin_password' => $password
                        ],
                    ];
                    $message = new AdminWelcomeMessage($contentVars, 'admin_welcome_message');
                    $body = $message->renderMessage();

                    send_sms(format_phone($user->phone), $body);
                }

                DB::commit();

                return response()->json([
                    'message' => 'User already exists. Role updated.',
                    'user'    => $user->load('roles')
                ], 200);
            }

            $password = Str::random(6);

            $user = User::create(array_merge(
                $validator->validated(),
                [
                    'password' => bcrypt($password), // 🔐 IMPORTANT FIX
                    'reset_token' => (string) Str::uuid(),
                ]
            ));

            $user->assignRole($request->role);

            if ($user->phone) {
                $contentVars = [
                    'en' => [ //Optional wrap with locale
                        'first_name' => explode(' ', trim($request->name))[0],
                        'admin_login' => $user->phone,
                        'admin_password' => $password
                    ],
                ];
                $message = new AdminWelcomeMessage($contentVars, 'admin_welcome_message');
                $body = $message->renderMessage();

                send_sms(format_phone($user->phone), $body);
            }

            DB::commit(); // ✅ everything successful

            return response()->json([
                'message' => 'Administrator added',
                'user' => $user
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack(); // 🔁 undo everything

            Log::error('User creation failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'message' => 'Failed to create user',
                'error' => config('app.debug') ? $e->getMessage() : 'Server error'
            ], 500);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
        ];

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|between:2,100',
            'email' => 'required|string|email|max:100|unique:users,email,' . $id,
            'phone' => 'required|string|unique:users,phone,' . $id,
            'role' => 'required|string',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $user = User::find($id);
        $user->name = $request->name;
        $user->email = $request->email;
        $user->phone = $request->phone;
        $user->save();

        $user->syncRoles([]);

        $user->assignRole($request->role);

        return response()->json([
            'message' => 'User saved',
            'user' => $user
        ], 200);
    }

    public function ajax()
    {
        $users = (new User)->newQuery();
        if (request()->has('q')) {
            $users->where(function ($query) {
                $query->where('name', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $users->whereHas("roles", function ($q) {
            $q->whereIn("name", ["super-administrator", "ict", "administrator", "customer-creator", "engineer", "financial-manager", "manager", "technician", "customer-care"]);
        });
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new UserCollection($users->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $user = User::find($id);
        $user->syncRoles([]);
        $user->delete();
        return response()->json([
            'message' => 'Administrator deleted'
        ], 200);
    }
}
