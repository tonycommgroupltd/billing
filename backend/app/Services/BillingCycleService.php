<?php

namespace App\Services;

use App\Messages\InvoiceCreateMessage;
use App\Messages\OnPaymentMessage;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceDetail;
use App\Models\MessageTemplate;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Service;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Internet and invoices follow the amount paid:
 *   week price → 7 days + paid week invoice
 *   2-week price → 14 days + paid 2-week invoice
 *   month price → 1 month + paid month invoice
 * Leftover money stays as credit. Next month invoice is opened when bill_to is near.
 */
class BillingCycleService
{
    public function monthlyPrice(Service $service): float
    {
        $price = (float) $service->price;
        if ($price > 0) {
            return $price;
        }
        $plan = Plan::find($service->plan_id);

        return $plan ? (float) $plan->price : 0.0;
    }

    public function weeklyPrice(Service $service): float
    {
        $monthly = $this->monthlyPrice($service);
        $plan = Plan::find($service->plan_id);
        $fromPlan = $plan ? (float) ($plan->weekly_price ?? 0) : 0;
        $planMonthly = $plan ? (float) $plan->price : 0;
        if ($fromPlan > 0 && $planMonthly > 0 && abs($planMonthly - $monthly) < 0.01) {
            return $fromPlan;
        }

        return tonycomm_weekly_price($monthly);
    }

    public function biweeklyPrice(Service $service): float
    {
        $monthly = $this->monthlyPrice($service);
        $plan = Plan::find($service->plan_id);
        $fromPlan = $plan ? (float) ($plan->bi_weekly_price ?? 0) : 0;
        $planMonthly = $plan ? (float) $plan->price : 0;
        if ($fromPlan > 0 && $planMonthly > 0 && abs($planMonthly - $monthly) < 0.01) {
            return $fromPlan;
        }

        return tonycomm_biweekly_price($monthly);
    }

    public function amountDue(Service $service, ?Customer $customer = null): float
    {
        $customer = $customer ?: Customer::find($service->customer_id);
        $credit = $customer ? max(0, (float) $customer->credit) : 0;
        $unpaid = service_latest_unpaid_invoice($service->id);
        if ($unpaid) {
            $paid = (float) Payment::where('invoice_id', $unpaid->id)->sum('sum');

            return max(0, round($this->invoiceChargeTotal($unpaid) - $paid - $credit, 2));
        }

        return max(0, round($this->monthlyPrice($service) - $credit, 2));
    }

    /**
     * Longest period this money can buy. This is the only rule for internet time.
     *
     * @return array{0:string,1:float,2:string} grant, used, label
     */
    public static function pickGrant(float $available, float $monthly, float $biweekly, float $weekly): array
    {
        if ($monthly > 0 && $available + 0.009 >= $monthly) {
            return ['month', $monthly, '1 month'];
        }
        if ($biweekly > 0 && $available + 0.009 >= $biweekly) {
            return ['biweekly', $biweekly, '2 weeks'];
        }
        if ($weekly > 0 && $available + 0.009 >= $weekly) {
            return ['weekly', $weekly, '1 week'];
        }

        return ['none', 0.0, ''];
    }

    public function isPeriodInvoiceTotal(Service $service, float $total): bool
    {
        foreach ([$this->weeklyPrice($service), $this->biweeklyPrice($service), $this->monthlyPrice($service)] as $price) {
            if ($price > 0 && abs($total - $price) < 0.01) {
                return true;
            }
        }

        return false;
    }

    /**
     * Apply an incoming payment: buy the longest period they can afford,
     * activate immediately, leftover becomes credit.
     *
     * @return array<string,mixed>
     */
    public function applyIncomingPayment(Service $service, float $amount, $paidAt = null): array
    {
        $paidAt = $paidAt ? Carbon::parse($paidAt) : Carbon::now();
        $customer = Customer::find($service->customer_id);
        $monthly = $this->monthlyPrice($service);
        $weekly = $this->weeklyPrice($service);
        $biweekly = $this->biweeklyPrice($service);
        $wallet = $customer ? (float) $customer->credit : 0;
        $available = max(0, $wallet) + $amount;
        $unpaid = service_latest_unpaid_invoice($service->id);
        $hadUnpaid = (bool) $unpaid;
        $invoiceTotal = $unpaid ? $this->invoiceChargeTotal($unpaid) : $monthly;
        $extraInvoice = $unpaid && $this->invoiceHasExtraCharges($unpaid, $monthly);

        $alreadyPaid = $unpaid
            ? (float) Payment::where('invoice_id', $unpaid->id)->sum('sum')
            : 0.0;
        $remainingOnInvoice = $unpaid
            ? round(max(0, $invoiceTotal - $alreadyPaid), 2)
            : 0.0;
        $installAmt = $unpaid ? $this->installationAmount($unpaid) : 0.0;
        $internetOnInvoice = $unpaid ? max(0, round($invoiceTotal - $installAmt, 2)) : $monthly;
        $internetStillUnpaid = $unpaid ? max(0, round($internetOnInvoice - $alreadyPaid, 2)) : $monthly;
        $clearsExtras = $extraInvoice && $remainingOnInvoice > 0 && $available + 0.009 >= $remainingOnInvoice;

        // First-time install invoice: clearing it grants 1 free month (promo).
        // Partial pays on that invoice still buy week / 2-week / month from the money.
        if ($clearsExtras) {
            $used = $remainingOnInvoice;
            $grant = 'month';
            $label = '1 month';
        } elseif ($unpaid && !$extraInvoice && $invoiceTotal > 0 && $alreadyPaid + 0.009 >= $invoiceTotal) {
            $grant = 'month';
            $used = 0.0;
            $label = '1 month';
        } elseif ($amount < 0.01 && !$unpaid) {
            // Scheduled jobs call with 0 — do not spend wallet credit as new internet time.
            $grant = 'none';
            $used = 0.0;
            $label = '';
        } else {
            [$grant, $used, $label] = self::pickGrant($available, $monthly, $biweekly, $weekly);
        }

        $remainder = round(max(0, $available - $used), 2);
        if ($customer) {
            $creditTarget = $wallet < 0
                ? round($wallet + $amount - $used, 2)
                : $remainder;
            $this->setCredit($customer, $creditTarget, 'Payment allocation '.$paidAt->toDateTimeString());
            $customer->refresh();
        }

        $remainingIsPaid = $this->remainingTimeIsPaid($service);
        $billTo = $service->bill_to ? Carbon::parse($service->bill_to) : $paidAt->copy();
        $from = self::timeGrantStartsAt(
            $paidAt,
            $billTo,
            (int) ($service->status['value'] ?? 0),
            $remainingIsPaid
        );

        $activated = false;
        if ($grant !== 'none') {
            $this->applyGrantToBillTo($service, $grant, $from);
            $activated = $this->activateNow($service);
            $service->save();
        } else {
            $service->save();
        }

        // Internet follows the money. Renewal invoices become paid week / 2-week /
        // month bills. Installation invoices stay open until the extra is cleared.
        $installDue = 0.0;
        if ($clearsExtras && $unpaid) {
            $invoice = $this->settleInvoiceForGrant($unpaid, $service, $grant, $remainingOnInvoice, true);
        } elseif ($extraInvoice && $unpaid) {
            $invoice = $unpaid;
            $installDue = round(max(0, $remainingOnInvoice - $available), 2);
        } elseif ($grant === 'none') {
            $invoice = $unpaid;
        } else {
            $invoice = $unpaid ?: $this->newInvoice(
                $service,
                $used > 0 ? $used : $this->monthlyPrice($service),
                billing_day_end($service->bill_to)
            );
            $invoice = $this->settleInvoiceForGrant($invoice, $service, $grant, $used, false);
        }

        $dueAfter = $this->amountDue($service->fresh(), $customer?->fresh());

        return [
            'amount' => $amount,
            'grant' => $grant,
            'grant_label' => $label,
            'used' => $used,
            'credit' => $remainder,
            'monthly' => $monthly,
            'weekly' => $weekly,
            'biweekly' => $biweekly,
            'to_pay' => $dueAfter,
            'bill_to' => $service->bill_to,
            'activated' => $activated,
            'invoice' => $invoice,
            'customer' => $customer,
            'install_due' => $installDue,
            'install_fee' => $installAmt,
            'cleared_extras' => $clearsExtras,
        ];
    }

    /**
     * Admin: apply wallet credit to a specific invoice's service line.
     */
    public function applyWalletToInvoice(Invoice $invoice, ?Customer $customer = null, $paidAt = null): array
    {
        $paidAt = $paidAt ? Carbon::parse($paidAt) : Carbon::now();
        $service = Service::find($invoice->services_id);
        if (!$service) {
            return ['ok' => false, 'grant' => 'none', 'message' => 'Service not found for this invoice.'];
        }
        $customer = $customer ?: Customer::find($service->customer_id);
        if (!$customer || (float) $customer->credit < 0.01) {
            return ['ok' => false, 'grant' => 'none', 'message' => 'Customer has no account credit.'];
        }
        if ((int) ($invoice->status['value'] ?? 0) === 2) {
            return ['ok' => false, 'grant' => 'none', 'message' => 'This invoice is already paid.'];
        }

        $result = $this->applyIncomingPayment($service, 0, $paidAt);
        if (($result['grant'] ?? 'none') === 'none') {
            return array_merge($result, [
                'ok' => false,
                'message' => 'Credit could not buy internet time on service #'.$service->id.'. '
                    .$this->reminderDueAmount($service, $customer, $invoice),
            ]);
        }

        return array_merge($result, ['ok' => true, 'message' => 'Credit applied successfully.']);
    }

    public function ensureMonthlyInvoice(Service $service, ?Customer $customer = null, bool $coverWithCredit = false, bool $syncDueDate = true): ?Invoice
    {
        $monthly = $this->monthlyPrice($service);
        if ($monthly <= 0) {
            return null;
        }
        $customer = $customer ?: Customer::find($service->customer_id);
        $unpaid = service_latest_unpaid_invoice($service->id);
        $dueDate = $service->bill_to
            ? billing_day_end($service->bill_to)
            : billing_day_end(Carbon::now());

        if ($unpaid) {
            if ($this->invoiceHasExtraCharges($unpaid, $monthly)) {
                $unpaid->total = $this->invoiceChargeTotal($unpaid);
            } elseif (!$this->isPeriodInvoiceTotal($service, (float) $unpaid->total)
                || abs((float) $unpaid->total - $monthly) < 0.01) {
                $unpaid->total = $monthly;
            }
            if ($syncDueDate) {
                $unpaid->due_date = $dueDate;
            }
            $unpaid->status = ['label' => 'Unpaid', 'value' => 1];
            $unpaid->save();
            if ($coverWithCredit) {
                $this->coverInvoiceWithCredit($service, $unpaid, $customer);
            }

            return $unpaid->fresh();
        }

        $invoice = Invoice::create([
            'services_id' => $service->id,
            'invoice_date' => Carbon::now(),
            'due_date' => $dueDate,
            'total' => $monthly,
            'status' => ['label' => 'Unpaid', 'value' => 1],
            'last_rdr_check' => 0,
        ]);
        if ($coverWithCredit) {
            $this->coverInvoiceWithCredit($service, $invoice, $customer);
        }

        return $invoice->fresh();
    }

    private function newInvoice(Service $service, float $total, Carbon $dueDate): Invoice
    {
        return Invoice::create([
            'services_id' => $service->id,
            'invoice_date' => Carbon::now(),
            'due_date' => $dueDate,
            'total' => round(max(0, $total), 2),
            'status' => ['label' => 'Unpaid', 'value' => 1],
            'last_rdr_check' => 0,
        ]);
    }

    /**
     * Match the invoice to the time that was actually bought.
     * Install+extras stay open unless the full extra invoice is covered.
     */
    public function settleInvoiceForGrant(
        Invoice $invoice,
        Service $service,
        string $grant,
        float $used,
        bool $extraInvoice
    ): Invoice {
        $due = $service->bill_to
            ? billing_day_end($service->bill_to)
            : billing_day_end(Carbon::now());

        if ($extraInvoice) {
            $invoice->total = $this->invoiceChargeTotal($invoice);
            $invoice->due_date = $due;
            $invoice->status = ['label' => 'Paid', 'value' => 2];
            $invoice->save();

            return $invoice->fresh();
        }

        if ($grant === 'none') {
            return $invoice;
        }

        $total = $grant === 'month'
            ? max($used, $this->monthlyPrice($service))
            : $used;
        if ($total < 0.01) {
            $total = $used > 0 ? $used : $this->monthlyPrice($service);
        }

        $invoice->total = round($total, 2);
        $invoice->due_date = $due;
        $invoice->status = ['label' => 'Paid', 'value' => 2];
        $invoice->save();
        $this->syncInternetInvoiceDetail($invoice, (float) $invoice->total, $grant);

        return $invoice->fresh();
    }

    private function syncInternetInvoiceDetail(Invoice $invoice, float $total, string $grant): void
    {
        $label = $grant === 'weekly'
            ? 'Internet subscription (1 week)'
            : ($grant === 'biweekly'
                ? 'Internet subscription (2 weeks)'
                : 'Internet subscription service');
        $row = InvoiceDetail::where('invoice_id', $invoice->id)
            ->whereNull('deleted_at')
            ->where('service_type', 'internet')
            ->orderBy('id')
            ->first();
        if ($row) {
            $row->name = $label;
            $row->price_per_unit = $total;
            $row->save();
        }
    }

    /**
     * If wallet credit covers the monthly invoice, mark it paid, consume that
     * credit, and grant a month of internet. Invoice total stays the monthly price.
     */
    public function coverInvoiceWithCredit(Service $service, Invoice $invoice, ?Customer $customer = null): bool
    {
        $customer = $customer ?: Customer::find($service->customer_id);
        $charge = $this->invoiceChargeTotal($invoice);
        $credit = $customer ? (float) $customer->credit : 0;
        if (!$customer || $charge <= 0 || $credit + 0.009 < $charge) {
            return false;
        }

        $this->setCredit($customer, round($credit - $charge, 2), 'Invoice '.$invoice->id.' covered by credit');
        $paidAt = Carbon::now();
        $from = self::timeGrantStartsAt(
            $paidAt,
            $service->bill_to ? Carbon::parse($service->bill_to) : null,
            (int) ($service->status['value'] ?? 0),
            $this->remainingTimeIsPaid($service)
        );
        $this->applyGrantToBillTo($service, 'month', $from);
        $this->activateNow($service);
        $invoice->total = $charge;
        $invoice->due_date = $service->bill_to;
        $invoice->status = ['label' => 'Paid', 'value' => 2];
        $invoice->save();

        return true;
    }

    public function activateNow(Service $service): bool
    {
        $wasBlocked = in_array((int) ($service->status['value'] ?? 0), [1, 3], true);
        $service->status = ['label' => 'Active', 'value' => 2];
        $service->save();
        try {
            if ($wasBlocked) {
                activate_secret($service);
            }
        } catch (\Throwable $e) {
            // Status is already Active in billing; RADIUS/MikroTik retry jobs pick up the rest.
        }
        $service->refresh();
        if ((int) ($service->status['value'] ?? 0) !== 2) {
            $service->status = ['label' => 'Active', 'value' => 2];
            $service->save();
        }

        return true;
    }

    /**
     * Paid leftover time is stacked. Unpaid "bill to" from add-service or invoice
     * create is not — that period is what this payment is buying.
     */
    public static function timeGrantStartsAt(Carbon $paidAt, ?Carbon $billTo, int $statusVal, bool $remainingIsPaid): Carbon
    {
        $billTo = $billTo ? $billTo->copy() : $paidAt->copy();
        $fromNow = in_array($statusVal, [1, 3], true) || $billTo->lt($paidAt) || !$remainingIsPaid;

        return $fromNow ? $paidAt->copy() : $billTo->copy();
    }

    public function remainingTimeIsPaid(Service $service): bool
    {
        $unpaid = service_latest_unpaid_invoice($service->id);
        if ($unpaid && $service->bill_to) {
            $due = Carbon::parse($unpaid->due_date);
            $billTo = Carbon::parse($service->bill_to);
            if ($billTo->gt($due->copy()->addDays(7))) {
                return false;
            }
        }

        if (Invoice::where('services_id', $service->id)
            ->whereNull('deleted_at')
            ->where('status->value', 2)
            ->exists()) {
            return true;
        }

        $invoiceIds = Invoice::where('services_id', $service->id)
            ->whereNull('deleted_at')
            ->pluck('id');
        if ($invoiceIds->isEmpty()) {
            return false;
        }

        return Payment::whereIn('invoice_id', $invoiceIds)->exists();
    }

    public function applyGrantToBillTo(Service $service, string $grant, Carbon $from): void
    {
        if ($grant === 'month') {
            $service->bill_to = billing_day_end($from->copy()->addMonth());
        } elseif ($grant === 'biweekly') {
            $service->bill_to = billing_day_end($from->copy()->addDays(14));
        } elseif ($grant === 'weekly') {
            $service->bill_to = billing_day_end($from->copy()->addDays(7));
        }
        $service->save();
    }

    public function invoiceChargeTotal(Invoice $invoice): float
    {
        $sum = (float) InvoiceDetail::where('invoice_id', $invoice->id)
            ->whereNull('deleted_at')
            ->sum('price_per_unit');
        if ($sum > 0.009) {
            return round($sum, 2);
        }

        return round((float) $invoice->total, 2);
    }

    public function invoiceHasExtraCharges(Invoice $invoice, float $monthly): bool
    {
        $total = $this->invoiceChargeTotal($invoice);
        if ($total > $monthly + 0.009) {
            return true;
        }

        return InvoiceDetail::where('invoice_id', $invoice->id)
            ->whereNull('deleted_at')
            ->where('service_type', 'installation')
            ->exists();
    }

    public function installationAmount(Invoice $invoice): float
    {
        $sum = (float) InvoiceDetail::where('invoice_id', $invoice->id)
            ->whereNull('deleted_at')
            ->where('service_type', 'installation')
            ->sum('price_per_unit');

        return round($sum, 2);
    }

    public function reminderDueAmount(Service $service, ?Customer $customer = null, ?Invoice $invoice = null): string
    {
        $charge = $invoice ? $this->invoiceChargeTotal($invoice) : $this->monthlyPrice($service);
        $customer = $customer ?: Customer::find($service->customer_id);
        $credit = $customer ? max(0, (float) $customer->credit) : 0;
        $paid = $invoice ? (float) Payment::where('invoice_id', $invoice->id)->sum('sum') : 0;
        $toPay = max(0, round($charge - $paid - $credit, 2));
        if ($toPay <= 0) {
            return 'Ksh0 (invoice Ksh'.number_format($charge, 0).', already covered)';
        }
        if ($credit > 0 || $paid > 0) {
            return 'Ksh'.number_format($toPay, 0).' (invoice Ksh'.number_format($charge, 0).')';
        }

        return 'Ksh'.number_format($charge, 0);
    }

    public function paymentSmsBody(Customer $customer, array $result): string
    {
        return self::formatPaymentSms($result, (string) $customer->phone_number);
    }

    public static function formatPaymentSms(array $result, string $account = ''): string
    {
        $amount = number_format((float) ($result['amount'] ?? 0), 0);
        $credit = number_format((float) ($result['credit'] ?? 0), 0);
        $weekly = number_format((float) ($result['weekly'] ?? 0), 0);
        $txn = strtoupper(trim((string) ($result['trans_id'] ?? '')));
        $txnBit = $txn !== '' ? " transaction {$txn}" : '';
        $due = !empty($result['bill_to'])
            ? Carbon::parse($result['bill_to'])->format('j M Y')
            : '';
        $grant = $result['grant'] ?? 'none';

        if ($grant === 'none') {
            $creditAmt = (float) ($result['credit'] ?? 0);
            $weeklyAmt = (float) ($result['weekly'] ?? 0);
            if (!empty($result['cleared_extras'])) {
                $dueTxt = $due !== '' ? " Your next due date is {$due}." : '';
                $creditTxt = $creditAmt > 0.009 ? " KSh{$credit} remains on your account." : '';

                return "Dear customer, payment of KSh{$amount}{$txnBit} has been received. Your installation fee is now paid.{$dueTxt}{$creditTxt}";
            }
            if ($weeklyAmt > 0 && $creditAmt + 0.009 >= $weeklyAmt) {
                return "Dear customer, payment of KSh{$amount}{$txnBit} has been received. Your money is on the account. Please call 0110345166 so we can complete this payment.";
            }
            $moreWeek = max(0, round($weeklyAmt - $creditAmt, 0));
            $moreTxt = $moreWeek > 0 ? " Send KSh".number_format($moreWeek, 0)." more for 1 week." : '';

            return "Dear customer, payment of KSh{$amount}{$txnBit} has been received. This is not enough for 1 week (KSh{$weekly}). Your money is on the account.{$moreTxt}";
        }

        $period = $grant === 'month' ? '1 month' : ($grant === 'biweekly' ? '2 weeks' : '1 week');
        $dueTxt = $due !== '' ? " Your next due date is {$due}." : '';
        $creditAmt = (float) ($result['credit'] ?? 0);
        $creditTxt = $creditAmt > 0.009 ? " KSh{$credit} remains on your account." : '';
        $installDue = (float) ($result['install_due'] ?? 0);
        $installFee = (float) ($result['install_fee'] ?? 0);
        $installTxt = '';
        if ($installDue > 0.009) {
            $shown = $installFee > 0.009 && $installDue + 0.01 >= $installFee
                ? $installFee
                : $installDue;
            $installTxt = " Installation fee of KSh".number_format($shown, 0)." is still due.";
        }

        return "Dear customer, payment of KSh{$amount}{$txnBit} has been received. This covers {$period} of internet.{$dueTxt}{$creditTxt}{$installTxt}";
    }

    public function unmatchedPaymentSmsBody(string $paidAccount, float $amount): string
    {
        $amountTxt = number_format($amount, 0);
        $typed = trim($paidAccount) !== '' ? $paidAccount : 'blank';

        return "Tonycomm: We received Ksh{$amountTxt} but account {$typed} is not in our system, so internet was not switched on. Your money is safe with us. Call 0110345166 and we will put it on the correct account. Paybill 4129711. Use your phone number as the account.";
    }

    public function multiServicePaymentSmsBody(Customer $customer, float $amount, $services = null): string
    {
        $amountTxt = number_format($amount, 0);
        $acc = $customer->phone_number;
        $services = $services ?: Service::where('customer_id', $customer->id)->get();
        $accounts = $services->take(4)->map(function ($service) use ($acc) {
            return $acc.'#'.$service->id;
        })->implode(' or ');
        $more = $services->count() > 4 ? ' (and more)' : '';
        $count = $services->count();

        return "Tonycomm: We received Ksh{$amountTxt}. You have {$count} internet lines, so this money is saved as credit. It has not been put on any line. To apply it, use Paybill 4129711 Acc {$accounts}{$more}, or call 0110345166 and tell us which line.";
    }

    public function sendMultiServicePaymentSms(Customer $customer, float $amount, $services = null): void
    {
        $body = $this->multiServicePaymentSmsBody($customer, $amount, $services);
        $template = MessageTemplate::where('message_class', 'on_payment')->first();
        send_sms($customer->formatted_phone_no, $body, $customer->id, [], $template?->id);
    }

    public function sendUnmatchedPaymentSms(string $msisdn, string $paidAccount, float $amount): void
    {
        $to = Customer::formatPhoneNumber($msisdn);
        if (!$to) {
            return;
        }
        $body = $this->unmatchedPaymentSmsBody($paidAccount, $amount);
        send_sms($to, $body, 0);
    }

    public function sendPaymentSms(Customer $customer, Service $service, array $result): void
    {
        $body = $this->paymentSmsBody($customer, $result);
        $contentVars = [
            'en' => [
                'amount' => number_format((float) $result['amount'], 0),
                'account' => $customer->phone_number,
                'due_date' => !empty($result['bill_to'])
                    ? Carbon::parse($result['bill_to'])->format('j M Y')
                    : '',
                'applied' => (string) ($result['grant_label'] ?? ''),
            ],
        ];
        $template = MessageTemplate::where('message_class', 'on_payment')->first();
        send_sms($customer->formatted_phone_no, $body, $customer->id, $contentVars, $template?->id);
    }

    public function sendInvoiceSms(Customer $customer, Service $service, Invoice $invoice, bool $force = false): void
    {
        // One expiry/invoice SMS per unpaid invoice (bill_to stays put; do not re-SMS daily).
        // Claim the send atomically so overlapping schedule runs / stale models cannot spam.
        if (!$force) {
            $claimed = DB::table('invoices')
                ->where('id', $invoice->id)
                ->where('invoice_sms_sent', 0)
                ->update(['invoice_sms_sent' => 1, 'updated_at' => now()]);
            if ($claimed === 0) {
                return;
            }
            $invoice->invoice_sms_sent = true;
        } else {
            $invoice->invoice_sms_sent = true;
            $invoice->save();
        }

        $due = Carbon::parse($invoice->due_date)->format('jS M Y \a\t h:i a');
        $check = Service::where('customer_id', $customer->id)->count();
        $account = $check > 1
            ? $customer->phone_number.'#'.$service->id
            : $customer->phone_number;
        $dueAmount = $this->reminderDueAmount($service, $customer, $invoice);
        $contentVars = [
            'en' => [
                'due_date' => $due,
                'due_amount' => $dueAmount,
                'account' => $account,
            ],
        ];
        $message = new InvoiceCreateMessage($contentVars, 'invoice_create');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'invoice_create')->first();
        send_sms($customer->formatted_phone_no, $body, $customer->id, $contentVars, $template?->id);
    }

    private function setCredit(Customer $customer, float $target, string $reason): void
    {
        $current = (float) $customer->credit;
        $diff = round($target - $current, 2);
        if (abs($diff) < 0.01) {
            return;
        }
        if ($diff > 0) {
            $customer->increaseCredit($diff, $reason);
        } else {
            $customer->decreaseCredit(abs($diff), $reason);
        }
    }
}
