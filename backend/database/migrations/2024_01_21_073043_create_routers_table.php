<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('routers', function (Blueprint $table) {
            $table->id();
            $table->string('title')->unique();
            $table->json('nas_type')->nullable();
            $table->string('model')->nullable();
            $table->string('physical_address')->nullable();
            $table->string('host')->unique();
            $table->string('nas_ip')->nullable();
            $table->string('radius_secret')->nullable();
            $table->integer('api')->default(0);
            $table->string('api_login')->nullable();
            $table->string('api_password')->nullable();
            $table->string('api_port')->default('8728');
            $table->json('authorization')->nullable();
            $table->json('accounting')->nullable();
            $table->integer('status')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('routers');
    }
};
