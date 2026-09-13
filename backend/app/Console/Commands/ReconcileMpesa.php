<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\Mpesa;
use App\Models\Payment;
use App\Models\Service;
use App\Services\BillingCycleService;
use Illuminate\Console\Command;

class ReconcileMpesa extends Command
{
    protected $signature = 'reconcile:mpesa';

    protected $description = 'Reconcile M-Pesa to payments and activate internet immediately';

    public function handle()
    {
        $billing = app(BillingCycleService::class);
        $mpesa = Mpesa::where('status', 0)->get();

        foreach ($mpesa as $value) {
            $exist = Payment::where('trans_id', $value->TransID)->first();
            $mp = Mpesa::find($value->id);
            if ($exist) {
                $mp->status = 3;
                $mp->save();
                continue;
            }

            $ref = preg_replace('/\s+/', '', (string) $value->BillRefNumber);
            $phonePart = explode('#', $ref)[0] ?? $ref;
            $customer = c2b_user($phonePart) ?: c2b_user($value->BillRefNumber);
            if (!$customer && !empty($value->MSISDN)) {
                $customer = c2b_user($value->MSISDN);
            }
            $service = null;
            $result = null;

            if (check_service($value->BillRefNumber)) {
                $service = service_for_paybill_ref($ref, $customer);
            } elseif ($customer) {
                $services = Service::where('customer_id', $customer->id)->get();
                if ($services->count() > 1) {
                    $customer->increaseCredit($value->TransAmount, 'Service unknown: Customer has more than one service');
                    $billing->sendMultiServicePaymentSms($customer, (float) $value->TransAmount, $services);
                    $mp->status = 2;
                    $mp->save();
                    continue;
                }
                $service = $services->first();
            }

            if ($service && $service->id) {
                $result = $billing->applyIncomingPayment($service, (float) $value->TransAmount, $value->TransTime);
                $invoice = $result['invoice'] ?? null;
                if (!$invoice && ($result['grant'] ?? 'none') === 'none') {
                    $invoice = $billing->ensureMonthlyInvoice($service);
                }
                Payment::create([
                    'customer_id' => $service->customer_id,
                    'trans_id' => $value->TransID,
                    'payment_type' => 'mpesa',
                    'date' => $value->TransTime,
                    'sum' => $value->TransAmount,
                    'invoice_id' => $invoice?->id,
                ]);
                $mp->status = 2;
                $customer = $customer ?: Customer::find($service->customer_id);
                if ($customer) {
                    $result['trans_id'] = $value->TransID;
                    $billing->sendPaymentSms($customer, $service->fresh(), $result);
                }
            } elseif ($customer) {
                $customer->increaseCredit($value->TransAmount, 'Service unknown: Customer found but no service found');
                $billing->sendUnmatchedPaymentSms(
                    $customer->formatted_phone_no ?: (string) $value->MSISDN,
                    (string) $value->BillRefNumber,
                    (float) $value->TransAmount
                );
                $mp->status = 2;
            } else {
                $mp->status = 1;
                if (!empty($value->MSISDN)) {
                    $billing->sendUnmatchedPaymentSms(
                        (string) $value->MSISDN,
                        (string) $value->BillRefNumber,
                        (float) $value->TransAmount
                    );
                }
            }

            $mp->save();
        }
    }
}
