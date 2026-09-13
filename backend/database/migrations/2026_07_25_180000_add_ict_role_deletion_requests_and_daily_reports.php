<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    public function up(): void
    {
        if (!Role::where('name', 'ict')->where('guard_name', 'api')->exists()) {
            Role::create([
                'name' => 'ict',
                'display_name' => 'ICT',
                'guard_name' => 'api',
            ]);
        }

        // Ensure Spatie roles table has display_name if older DBs missed it
        if (Schema::hasTable('roles') && !Schema::hasColumn('roles', 'display_name')) {
            Schema::table('roles', function (Blueprint $table) {
                $table->string('display_name')->nullable()->after('name');
            });
            DB::table('roles')->where('name', 'ict')->update(['display_name' => 'ICT']);
        }

        Schema::create('deletion_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('requested_by');
            $table->string('request_method', 16)->default('DELETE');
            $table->string('request_path', 500);
            $table->string('resource_type', 100)->nullable();
            $table->string('resource_id', 100)->nullable();
            $table->string('resource_label', 255)->nullable();
            $table->text('reason')->nullable();
            $table->string('status', 32)->default('pending'); // pending|approved|rejected|completed|cancelled
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamp('executed_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['requested_by', 'status']);
            $table->foreign('requested_by')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('ict_daily_reports', function (Blueprint $table) {
            $table->id();
            $table->date('report_date')->unique();
            $table->string('overall_status', 32)->default('draft'); // draft|in_progress|submitted
            $table->string('summary_status', 16)->nullable(); // ok|issue
            $table->text('summary_notes')->nullable();
            $table->string('radius_status', 16)->nullable();
            $table->text('radius_notes')->nullable();
            $table->timestamp('radius_checked_at')->nullable();
            $table->unsignedBigInteger('radius_checked_by')->nullable();
            $table->string('sms_status', 16)->nullable();
            $table->text('sms_notes')->nullable();
            $table->timestamp('sms_checked_at')->nullable();
            $table->unsignedBigInteger('sms_checked_by')->nullable();
            $table->string('system_status', 16)->nullable();
            $table->text('system_notes')->nullable();
            $table->timestamp('system_checked_at')->nullable();
            $table->unsignedBigInteger('system_checked_by')->nullable();
            $table->text('issues_followups')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->unsignedBigInteger('submitted_by')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('ict_daily_report_routers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('report_id');
            $table->unsignedBigInteger('router_id');
            $table->string('router_title')->nullable();
            $table->string('status', 16)->default('pending'); // pending|ok|issue
            $table->text('notes')->nullable();
            $table->timestamp('checked_at')->nullable();
            $table->unsignedBigInteger('checked_by')->nullable();
            $table->timestamps();

            $table->unique(['report_id', 'router_id']);
            $table->foreign('report_id')->references('id')->on('ict_daily_reports')->cascadeOnDelete();
            $table->foreign('router_id')->references('id')->on('routers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ict_daily_report_routers');
        Schema::dropIfExists('ict_daily_reports');
        Schema::dropIfExists('deletion_requests');
        Role::where('name', 'ict')->where('guard_name', 'api')->delete();
    }
};
