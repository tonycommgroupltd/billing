<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        //$schedule->command('server-monitor:run-checks')->withoutOverlapping()->everyMinute();
        $schedule->command('create:invoice')->dailyAt('12:00');
        // After billing_day_end (23:55) so same-night cut has a few minutes to run.
        $schedule->command('reconcile:invoice')->dailyAt('23:56');
        // Safety net for any leftover due accounts.
        $schedule->command('reconcile:invoice')->dailyAt('00:05');
        $schedule->command('reconcile:mpesa')->withoutOverlapping()->everyMinute();
        $schedule->command('reconcile:services')->withoutOverlapping()->everyFiveMinutes();
        //$schedule->command('online:customers')->everyThirtyMinutes();
        $schedule->command('app:send-payment-reminder')->dailyAt('12:00');
        $schedule->command('app:send-disconnection-sms')->dailyAt('18:00');
        //$schedule->command('app:send-undelivered-to-whatsapp')->everyFiveMinutes();
        $schedule->command('backup:clean')->hourly();
        $schedule->command('backup:run')->hourlyAt(30);
        //$schedule->command('app:sync-customers-to-yii')->everyFiveMinutes();
        //$schedule->command('app:sync-customer-services-to-yii')->everyTenMinutes(); 
        //$schedule->command('app:update-ip-stats')->everyFiveMinutes();
        //$schedule->command('app:identify-ip')->everyMinute();
        //$schedule->command('app:delete-null')->everyMinute();
        //$schedule->command('app:delete-past')->everyMinute();
        $schedule->command('sms:send-bulk')
            ->withoutOverlapping()
            ->everyMinute()
            ->sendOutputTo(storage_path('logs/sms-bulk.log'))
            ->appendOutputTo(storage_path('logs/sms-bulk.log'));
        $schedule->command('send:whatsapp-messages')
            ->withoutOverlapping()
            ->everyMinute()
            ->sendOutputTo(storage_path('logs/whatsapp-bulk.log'))
            ->appendOutputTo(storage_path('logs/whatsapp-bulk.log'));
        $schedule->command('routers:sample-bandwidth')->withoutOverlapping()->everyMinute();
        $schedule->command('routers:sample-bandwidth --prune')->dailyAt('03:15');
        // Online PPPoE only — keeps billing DB light (auto-pruned after ~26h).
        $schedule->command('pppoe:sample-bandwidth')->withoutOverlapping()->everyFiveMinutes();
        $schedule->command('pppoe:sample-bandwidth --prune')->dailyAt('03:25');
        $schedule->command('app:retry-mikrotik-connections')
            ->withoutOverlapping()
            ->everyMinute();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}
