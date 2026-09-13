<?php

namespace App\Http\Controllers;

use App\Http\Resources\MessageDetailCollection;
use App\Models\MessageDetail;
use Illuminate\Http\Request;

class MessageDetailController extends Controller
{
    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $message = MessageDetail::leftJoin('customers', 'message_details.customer_id', '=', 'customers.id')->select('message_details.*', 'customers.name')->find($id);
        return response()->json([
            'message' => $message
        ], 200);
    }

    public function ajax()
    {
        $messages = (new MessageDetail)->newQuery();
        $messages->leftJoin('customers', 'message_details.customer_id', '=', 'customers.id');
        $messages->select('message_details.*', 'customers.name AS name');
        if (request()->has('q') && request()->input('q') !== '') {
            $q = request()->input('q');
            $messages->where(function ($query) use ($q) {
                $query->where('customers.name', 'like', '%' . $q . '%')
                    ->orWhere('message_details.status', 'like', '%' . $q . '%')
                    ->orWhere('message_details.recipient', 'like', '%' . $q . '%')
                    ->orWhere('message_details.message', 'like', '%' . $q . '%');
            });
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'desc');
        $sortCol = request('sort_col', 'id');
        $result = new MessageDetailCollection($messages->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function destroy($id)
    {
        $message = MessageDetail::find($id);
        $message->delete();
        return response()->json([
            'message' => 'Message deleted'
        ], 200);
    }
}
