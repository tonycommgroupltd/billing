<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class ReconcileServices extends Command
{
    protected $signature = 'reconcile:services {--limit=200 : Max records per healing pass}';

    protected $description = 'Heal paid invoices, stuck activations, and retry failed M-Pesa matches';

    public function handle()
    {
        $limit = (int) $this->option('limit');
        $stats = reconcile_stuck_payment_states($limit);

        $this->info(sprintf(
            'Reconcile complete: %d invoices closed, %d services activated, %d mpesa retried',
            $stats['invoices_closed'],
            $stats['services_activated'],
            $stats['mpesa_retried']
        ));

        return Command::SUCCESS;
    }
}
