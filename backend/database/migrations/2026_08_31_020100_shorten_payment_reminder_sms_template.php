<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $message = json_encode([
            'en' => 'TCOM: Pay [[due_amount]] Paybill 4129711 Acc [[account]]. Quick pay: [[pay_url]]. Help 0110345166.',
        ]);

        DB::table('message_templates')
            ->where('message_class', 'payment_reminder')
            ->update(['message' => $message, 'updated_at' => now()]);
    }

    public function down(): void
    {
        $message = json_encode([
            'en' => 'Dear customer, kindly top up [[due_amount]] via Paybill 4129711 Account [[account]] or pay instantly: [[pay_url]] — TCOM. No hidden charges, free auto-reconnect. Help: 0110345166.',
        ]);

        DB::table('message_templates')
            ->where('message_class', 'payment_reminder')
            ->update(['message' => $message, 'updated_at' => now()]);
    }
};
