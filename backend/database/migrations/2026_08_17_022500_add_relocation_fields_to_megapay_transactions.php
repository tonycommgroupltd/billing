<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('megapay_transactions', function (Blueprint $table) {
            if (!Schema::hasColumn('megapay_transactions', 'ticket_number')) {
                $table->string('ticket_number', 64)->nullable()->after('ticket_id');
            }
            if (!Schema::hasColumn('megapay_transactions', 'ticket_subject')) {
                $table->string('ticket_subject', 255)->nullable()->after('ticket_number');
            }
            if (!Schema::hasColumn('megapay_transactions', 'ticket_created_by')) {
                $table->string('ticket_created_by', 128)->nullable()->after('ticket_subject');
            }
            if (!Schema::hasColumn('megapay_transactions', 'payment_method')) {
                $table->string('payment_method', 16)->nullable()->after('status');
            }
        });

        Schema::table('megapay_transactions', function (Blueprint $table) {
            $table->unique('receipt', 'megapay_transactions_receipt_unique');
        });
    }

    public function down(): void
    {
        Schema::table('megapay_transactions', function (Blueprint $table) {
            $table->dropUnique('megapay_transactions_receipt_unique');
            $cols = [];
            foreach (['ticket_number', 'ticket_subject', 'ticket_created_by', 'payment_method'] as $col) {
                if (Schema::hasColumn('megapay_transactions', $col)) {
                    $cols[] = $col;
                }
            }
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });
    }
};
