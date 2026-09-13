<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->default(0)->index();
                $table->string('type', 50)->default('info');
                $table->string('title');
                $table->text('message');
                $table->string('icon', 50)->nullable()->default('bell');
                $table->string('link')->nullable();
                $table->boolean('is_read')->default(false)->index();
                $table->timestamps();
            });

            return;
        }

        Schema::table('notifications', function (Blueprint $table) {
            if (!Schema::hasColumn('notifications', 'user_id')) {
                $table->unsignedBigInteger('user_id')->default(0)->index();
            }
            if (!Schema::hasColumn('notifications', 'type')) {
                $table->string('type', 50)->default('info');
            }
            if (!Schema::hasColumn('notifications', 'title')) {
                $table->string('title')->default('');
            }
            if (!Schema::hasColumn('notifications', 'message')) {
                $table->text('message')->nullable();
            }
            if (!Schema::hasColumn('notifications', 'icon')) {
                $table->string('icon', 50)->nullable()->default('bell');
            }
            if (!Schema::hasColumn('notifications', 'link')) {
                $table->string('link')->nullable();
            }
            if (!Schema::hasColumn('notifications', 'is_read')) {
                $table->boolean('is_read')->default(false)->index();
            }
            if (!Schema::hasColumn('notifications', 'created_at')) {
                $table->timestamps();
            }
        });
    }

    public function down(): void
    {
        // Keep existing production data — no rollback.
    }
};
