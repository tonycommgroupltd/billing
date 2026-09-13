<?php

namespace Tests\Unit;

use App\Services\BillingCycleService;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

class BillingCycleGrantStartTest extends TestCase
{
    public function test_new_unpaid_line_starts_from_payment_date(): void
    {
        $paidAt = Carbon::parse('2026-08-15 13:49:00');
        $billTo = Carbon::parse('2026-09-15 23:55:00');

        $from = BillingCycleService::timeGrantStartsAt($paidAt, $billTo, 2, false);

        $this->assertSame('2026-08-15 13:49:00', $from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-09-15', $from->copy()->addMonth()->format('Y-m-d'));
    }

    public function test_paid_leftover_days_are_stacked(): void
    {
        $paidAt = Carbon::parse('2026-08-15 13:00:00');
        $billTo = Carbon::parse('2026-08-21 23:55:00');

        $from = BillingCycleService::timeGrantStartsAt($paidAt, $billTo, 2, true);

        $this->assertSame('2026-08-21 23:55:00', $from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-09-21', $from->copy()->addMonth()->format('Y-m-d'));
    }

    public function test_disabled_or_expired_starts_from_now(): void
    {
        $paidAt = Carbon::parse('2026-08-15 13:00:00');
        $billTo = Carbon::parse('2026-09-15 23:55:00');

        $disabled = BillingCycleService::timeGrantStartsAt($paidAt, $billTo, 1, true);
        $expired = BillingCycleService::timeGrantStartsAt($paidAt, $billTo, 3, true);

        $this->assertSame('2026-08-15 13:00:00', $disabled->format('Y-m-d H:i:s'));
        $this->assertSame('2026-08-15 13:00:00', $expired->format('Y-m-d H:i:s'));
    }

    public function test_past_bill_to_starts_from_now(): void
    {
        $paidAt = Carbon::parse('2026-08-15 13:00:00');
        $billTo = Carbon::parse('2026-08-10 23:55:00');

        $from = BillingCycleService::timeGrantStartsAt($paidAt, $billTo, 2, true);

        $this->assertSame('2026-08-15 13:00:00', $from->format('Y-m-d H:i:s'));
    }

    public function test_pick_grant_follows_amount_paid(): void
    {
        $this->assertSame(['month', 1500.0, '1 month'], BillingCycleService::pickGrant(1500, 1500, 765, 395));
        $this->assertSame(['biweekly', 765.0, '2 weeks'], BillingCycleService::pickGrant(765, 1500, 765, 395));
        $this->assertSame(['weekly', 395.0, '1 week'], BillingCycleService::pickGrant(395, 1500, 765, 395));
        $this->assertSame(['none', 0.0, ''], BillingCycleService::pickGrant(200, 1500, 765, 395));
        $this->assertSame(['month', 1500.0, '1 month'], BillingCycleService::pickGrant(2000, 1500, 765, 395));
    }

    public function test_week_payment_sms_is_short_and_clear(): void
    {
        $body = BillingCycleService::formatPaymentSms([
            'amount' => 765,
            'grant' => 'biweekly',
            'trans_id' => 'UHHB13BZT4',
            'bill_to' => '2026-08-31 23:55:00',
            'credit' => 0,
        ], '0720338167');

        $this->assertSame(
            'Dear customer, payment of KSh765 transaction UHHB13BZT4 has been received. This covers 2 weeks of internet. Your next due date is 31 Aug 2026.',
            $body
        );
    }

    public function test_week_payment_sms_without_trans_id(): void
    {
        $body = BillingCycleService::formatPaymentSms([
            'amount' => 395,
            'grant' => 'weekly',
            'bill_to' => '2026-08-24 23:55:00',
            'credit' => 0,
        ]);

        $this->assertSame(
            'Dear customer, payment of KSh395 has been received. This covers 1 week of internet. Your next due date is 24 Aug 2026.',
            $body
        );
    }

    public function test_first_time_week_sms_keeps_installation_due(): void
    {
        $body = BillingCycleService::formatPaymentSms([
            'amount' => 1500,
            'grant' => 'month',
            'trans_id' => 'UHINSTALL01',
            'bill_to' => '2026-09-17 23:55:00',
            'credit' => 0,
            'install_due' => 2000,
            'install_fee' => 2000,
        ]);

        $this->assertSame(
            'Dear customer, payment of KSh1500 transaction UHINSTALL01 has been received. This covers 1 month of internet. Your next due date is 17 Sep 2026. Installation fee of KSh2,000 is still due.',
            $body
        );
    }

    public function test_install_only_balance_sms(): void
    {
        $body = BillingCycleService::formatPaymentSms([
            'amount' => 2000,
            'grant' => 'none',
            'trans_id' => 'UHINSTALL02',
            'bill_to' => '2026-09-17 23:55:00',
            'credit' => 0,
            'weekly' => 395,
            'cleared_extras' => true,
        ]);

        $this->assertSame(
            'Dear customer, payment of KSh2000 transaction UHINSTALL02 has been received. Your installation fee is now paid. Your next due date is 17 Sep 2026.',
            $body
        );
    }
}
