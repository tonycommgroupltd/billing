<?php

namespace App\Http\Controllers;

use App\Models\RadiusAccounting;
use App\Models\RadiusAccountingLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class RadiusAccountingController extends Controller
{
    public function handle(Request $request)
    {
        $payload = $request->all();
        try {
            $statusType = $request->input('Acct-Status-Type');
            $username = $request->input('User-Name');
            $sessionId = $request->input('Acct-Session-Id');

            $account = RadiusAccounting::firstOrNew([
                'session_id' => $sessionId,
                'username' => $username,
            ]);

            $account->nas_ip = $request->input('NAS-IP-Address');
            $account->framed_ip = $request->input('Framed-IP-Address');
            $account->acct_status_type = $statusType;
            $account->input_octets = (int) $request->input('Acct-Input-Octets', 0);
            $account->output_octets = (int) $request->input('Acct-Output-Octets', 0);
            $account->session_time = (int) $request->input('Acct-Session-Time', 0);
            //$account->input_octets = $request->input('Acct-Input-Octets', 0);
            //$account->output_octets = $request->input('Acct-Output-Octets', 0);
            //$account->session_time = $request->input('Acct-Session-Time', 0);
            $account->terminate_cause = $request->input('Acct-Terminate-Cause');

            if ($statusType === 'Start') {
                $account->start_time = Carbon::now();
            } elseif ($statusType === 'Stop') {
                $account->stop_time = Carbon::now();
            }

            $account->save();
        } catch (\Throwable $e) {
            // ⚠️ Log the failure into DB and file
            RadiusAccountingLog::create([
                'username'    => $request->input('User-Name'),
                'session_id'  => $request->input('Acct-Session-Id'),
                'status_type' => $request->input('Acct-Status-Type'),
                'nas_ip'      => $request->input('NAS-IP-Address'),
                'framed_ip'   => $request->input('Framed-IP-Address'),
                'payload'     => $payload,
                'error_message' => $e->getMessage(),
            ]);

            //Log::error('RADIUS Accounting Error: ' . $e->getMessage());

            //return response()->json(['error' => 'Failed to save accounting record'], 500);
        }

        return response('OK', 200);
    }
}
