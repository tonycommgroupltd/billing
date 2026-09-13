<?php

namespace Tests\Feature;

use App\Http\Middleware\Authenticate;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Middleware\RoleMiddleware;
use Tests\TestCase;

class CustomerDocumentsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'database.connections.sqlite.foreign_key_constraints' => true,
        ]);
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        $this->createSchema();
        $this->withoutMiddleware([Authenticate::class, RoleMiddleware::class]);
    }

    public function test_statement_calculates_opening_running_and_closing_balances_with_inclusive_end_date(): void
    {
        $this->seedCustomerLedger();

        $response = $this->getJson(
            '/api/v1/customers/3886/statement?from=2026-02-01&to=2026-02-28'
        );

        $response
            ->assertOk()
            ->assertJsonPath('opening_balance', 600)
            ->assertJsonPath('totals.debits', 1500)
            ->assertJsonPath('totals.credits', 500)
            ->assertJsonPath('closing_balance', 1600)
            ->assertJsonCount(2, 'transactions')
            ->assertJsonPath('transactions.0.reference', 'INV-102')
            ->assertJsonPath('transactions.0.balance', 2100)
            ->assertJsonPath('transactions.1.reference', 'MPESA-500')
            ->assertJsonPath('transactions.1.balance', 1600);
    }

    public function test_statement_rejects_an_inverted_date_range(): void
    {
        $this->seedCustomerLedger();

        $this->getJson('/api/v1/customers/3886/statement?from=2026-03-01&to=2026-02-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors('from');
    }

    public function test_receipt_rejects_unpaid_and_cross_customer_invoices(): void
    {
        $this->seedCustomerLedger();
        $this->insertCustomer(4999, 2, 'Another Customer');

        $this->getJson('/api/v1/customers/3886/invoices/102/receipt')
            ->assertStatus(422);

        $this->getJson('/api/v1/customers/4999/invoices/102/receipt')
            ->assertNotFound();
    }

    public function test_paid_invoice_and_statement_download_as_pdf(): void
    {
        $this->seedCustomerLedger();
        DB::table('payments')->insert([
            'id' => 503,
            'customer_id' => 3886,
            'invoice_id' => 102,
            'trans_id' => 'MPESA-1000',
            'payment_type' => 'mpesa',
            'date' => '2026-02-28',
            'sum' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->get('/api/v1/customers/3886/invoices/102/receipt')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');

        $this->get('/api/v1/customers/3886/statement/pdf?from=2026-02-01&to=2026-02-28')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_unpaid_and_period_merged_sales_invoices_download_as_pdf(): void
    {
        $this->seedCustomerLedger();

        $this->get('/api/v1/customers/3886/invoices/102/sales-invoice')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');

        $this->get('/api/v1/customers/3886/sales-invoice/pdf?from=2026-02-01&to=2026-02-28')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');

        $this->getJson('/api/v1/customers/3886/documents?from=2026-02-01&to=2026-02-28')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', 102);
    }

    public function test_statement_download_link_can_be_sent_by_email(): void
    {
        Mail::fake();
        $this->seedCustomerLedger();

        $this->postJson('/api/v1/customers/3886/documents/share', [
            'type' => 'statement',
            'channel' => 'email',
            'from' => '2026-02-01',
            'to' => '2026-02-28',
        ])->assertOk()
            ->assertJsonPath('channel', 'email')
            ->assertJsonPath('destination', 'rahab@example.test');
    }

    private function seedCustomerLedger(): void
    {
        DB::table('users')->insert([
            'id' => 1,
            'name' => 'Rahab Kiarie',
            'email' => 'rahab@example.test',
            'password' => 'unused',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->insertCustomer(3886, 1, 'Rahab Kiarie');
        DB::table('plans')->insert([
            'id' => 10,
            'title' => 'Home 10 Mbps',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('services')->insert([
            'id' => 20,
            'customer_id' => 3886,
            'plan_id' => 10,
            'mikrotik_name' => 'rahabhost',
            'price' => 1500,
            'status' => json_encode(['label' => 'Active', 'value' => 2]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('invoices')->insert([
            [
                'id' => 101,
                'services_id' => 20,
                'invoice_date' => '2026-01-31 12:00:00',
                'due_date' => '2026-02-05 23:59:59',
                'total' => 1000,
                'status' => json_encode(['label' => 'Part paid', 'value' => 1]),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => 102,
                'services_id' => 20,
                'invoice_date' => '2026-02-28 23:30:00',
                'due_date' => '2026-03-05 23:59:59',
                'total' => 1500,
                'status' => json_encode(['label' => 'Unpaid', 'value' => 1]),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
        DB::table('payments')->insert([
            [
                'id' => 501,
                'customer_id' => 3886,
                'invoice_id' => 101,
                'trans_id' => 'MPESA-400',
                'payment_type' => 'mpesa',
                'date' => '2026-01-31',
                'sum' => 400,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => 502,
                'customer_id' => 3886,
                'invoice_id' => 102,
                'trans_id' => 'MPESA-500',
                'payment_type' => 'mpesa',
                'date' => '2026-02-28',
                'sum' => 500,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    private function insertCustomer(int $id, int $userId, string $name): void
    {
        DB::table('customers')->insert([
            'id' => $id,
            'user_id' => $userId,
            'name' => $name,
            'phone_number' => '0720605124',
            'address' => 'St Anthony',
            'city' => 'Nairobi',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createSchema(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('password')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('name');
            $table->text('phone_number')->nullable();
            $table->text('address')->nullable();
            $table->string('city')->nullable();
            $table->timestamps();
        });
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('plan_id')->nullable();
            $table->string('mikrotik_name')->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->text('status')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('services_id');
            $table->dateTime('invoice_date');
            $table->dateTime('due_date')->nullable();
            $table->decimal('total', 12, 2);
            $table->text('status')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->string('trans_id')->nullable();
            $table->string('payment_type')->nullable();
            $table->date('date');
            $table->decimal('sum', 12, 2);
            $table->timestamps();
        });
    }
}
