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
        Schema::create('whatsapp_templates', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('whatsapp_template_id')->unique();
            $table->unsignedBigInteger('whatsapp_business_account_id')->nullable();
            $table->string('name');
            $table->string('description')->nullable();
            $table->string('category');
            $table->string('language');
            $table->text('header')->nullable();
            $table->json('body')->nullable();
            $table->text('footer')->nullable();
            $table->json('buttons')->nullable();
            $table->string('status')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('whatsapp_templates');
    }
};
