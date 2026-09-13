<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;
use App\Http\Resources\RoleCollection;
use Validator;

class RoleController extends Controller
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
        $role = Role::find($id);

        return response()->json([
            'role' => $role
        ], 200);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field name (allowed only a-z, 0-9 and dash).'
        ];

        $validator = Validator::make($request->all(), [
            'title' => 'required|string',
            'name' => ['regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', 'required', 'string', 'unique:roles'],
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $role = Role::create(['name' => $request->name, 'display_name' => $request->title]);

        return response()->json([
            'message' => 'Role added',
            'role' => $role
        ], 201);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field name (allowed only a-z, 0-9 and dash).'
        ];

        $validator = Validator::make($request->all(), [
            'title' => 'required|string',
            'name' => ['regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', 'required', 'string', 'unique:roles,name,' . $id],
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $role = Role::find($id);
        $role->name = $request->name;
        $role->display_name = $request->title;
        $role->save();
        return response()->json([
            'message' => 'Role saved',
            'role' => $role
        ], 200);
    }

    public function ajax()
    {
        $roles = (new Role)->newQuery();
        if (request()->has('q')) {
            $roles->where(function ($query) {
                $query->where('display_name', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('name', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new RoleCollection($roles->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }
}
