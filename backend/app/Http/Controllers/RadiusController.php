<?php

namespace App\Http\Controllers;

use App\Models\Plan;
use App\Models\Service;
use Illuminate\Http\Request;

class RadiusController extends Controller
{
    public function authorizeUser(Request $request, $username)
    {
        $nasIp = $request->query('nas_ip');
        $nasId = $request->query('nas_id');

        $user = Service::where('mikrotik_name', $username)->first();

        if (!$user) {
            return response()->json([
                'reply:Mikrotik-Group' => 'EXPIRED',
                'reply:Reply-Message' => 'User not found',
                'reply:Framed-Protocol' => 'PPP',
                'reply:Service-Type' => 'Framed-User',
                "control:Auth-Type" => "Accept",
                "control:Cleartext-Password" => "default123",
                "reply:Simultaneous-Use" => 1,
                "reply:Interim-Interval" => 300,
            ]);
        }

        // Switch router if needed
        $this->switchRouter($user, $nasIp);

        // Expired user
        if ($user->status['value'] !== 2) {
            return response()->json([
                'reply:Mikrotik-Group' => 'EXPIRED',
                'reply:Reply-Message' => 'Your profile has expired',
                'reply:Framed-Protocol' => 'PPP',
                'reply:Service-Type' => 'Framed-User',
                "control:Cleartext-Password" => $user->mikrotik_password,
                "reply:Simultaneous-Use" => 1,
                "reply:Interim-Interval" => 300,
            ]);
        }

        $plan = Plan::find($user->plan_id);

        return response()->json([
            'reply:Mikrotik-Group' => $plan->rate_limit['label'],
            'reply:Reply-Message' => 'User connected',
            'reply:Framed-Protocol' => 'PPP',
            'reply:Service-Type' => 'Framed-User',
            "control:Cleartext-Password" => $user->mikrotik_password,
            "reply:Simultaneous-Use" => 1,
            "reply:Interim-Interval" => 300,
        ]);
    }

    private function switchRouter($user, $nasIp)
    {
        $routerMap = [
            "102.0.15.94"   => 1,
            "102.0.25.70"   => 1,

            "102.0.15.252"  => 2,
            "102.0.29.196"  => 2,

            "102.0.26.60"   => 3,

            "102.0.15.253"   => 4,

            // Same pool/plans as fiber clients (router 1) until dedicated plans exist
            "102.202.189.34" => 1,
        ];

        if (!isset($routerMap[$nasIp])) {
            return;
        }

        $routerId = $routerMap[$nasIp];

        if ($user->router_id == $routerId) {
            return;
        }

        $defaultPlan = Plan::find($user->plan_id);

        if (!$defaultPlan) {
            return;
        }

        $plan = Plan::where('rate_limit->label', $defaultPlan->rate_limit['label'])
            ->where('id', '!=', $defaultPlan->id)
            ->where('router_id', $routerId)
            ->first();

        if ($plan) {
            $user->plan_id = $plan->id;
        }

        $user->router_id = $routerId;
        $user->save();
    }
}
