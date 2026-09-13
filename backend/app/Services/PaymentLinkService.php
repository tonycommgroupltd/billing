<?php



namespace App\Services;



use App\Models\Invoice;

use App\Models\PaymentShortLink;

use App\Models\Service;



class PaymentLinkService

{

    public function createForInvoice(Invoice $invoice, Service $service, ?int $ttlDays = null): string

    {

        return $this->createShortForInvoice($invoice, $service, $ttlDays);

    }



    public function createShortForInvoice(Invoice $invoice, Service $service, ?int $ttlDays = null): string

    {

        $ttlDays = $ttlDays ?? (int) config('payment_link.ttl_days', 30);

        $expires = now()->addDays(max(1, $ttlDays));



        $existing = PaymentShortLink::query()

            ->where('invoice_id', $invoice->id)

            ->where('service_id', $service->id)

            ->where('expires_at', '>', now())

            ->orderByDesc('id')

            ->first();

        if ($existing) {

            return $this->shortUrl($existing->code);

        }



        do {

            $code = $this->randomCode(6);

        } while (PaymentShortLink::where('code', $code)->exists());



        PaymentShortLink::create([

            'code' => $code,

            'invoice_id' => $invoice->id,

            'service_id' => $service->id,

            'expires_at' => $expires,

        ]);



        return $this->shortUrl($code);

    }



    public function shortUrl(string $code): string

    {

        return config('payment_link.base_url').'/r/'.$code;

    }



    /** @return array{i:int,s:int,e:int}|null */

    public function resolveRef(string $ref): ?array

    {

        $ref = trim($ref);

        if ($ref === '') {

            return null;

        }



        if (!str_contains($ref, '.') && preg_match('/^[A-Za-z0-9]{4,12}$/', $ref)) {

            $link = PaymentShortLink::where('code', $ref)->first();

            if (!$link || $link->expires_at->isPast()) {

                return null;

            }



            return [

                'i' => (int) $link->invoice_id,

                's' => (int) $link->service_id,

                'e' => $link->expires_at->timestamp,

            ];

        }



        return $this->decodeToken($ref);

    }



    public function encodePayload(array $data): string

    {

        return rtrim(strtr(base64_encode(json_encode($data)), '+/', '-_'), '=');

    }



    public function sign(string $payload): string

    {

        return hash_hmac('sha256', $payload, (string) config('payment_link.secret'));

    }



    /** @return array{i:int,s:int,e:int}|null */

    public function decodeToken(string $token): ?array

    {

        $token = trim($token);

        if ($token === '' || !str_contains($token, '.')) {

            return null;

        }

        [$payload, $sig] = explode('.', $token, 2);

        if (!hash_equals($this->sign($payload), $sig)) {

            return null;

        }

        $encoded = strtr($payload, '-_', '+/');

        $encoded .= str_repeat('=', (4 - strlen($encoded) % 4) % 4);

        $data = json_decode(base64_decode($encoded, true) ?: '', true);

        if (!is_array($data) || empty($data['i']) || empty($data['s']) || empty($data['e'])) {

            return null;

        }

        if ((int) $data['e'] < time()) {

            return null;

        }



        return [

            'i' => (int) $data['i'],

            's' => (int) $data['s'],

            'e' => (int) $data['e'],

        ];

    }



    private function randomCode(int $len = 6): string

    {

        $chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

        $out = '';

        for ($i = 0; $i < $len; $i++) {

            $out .= $chars[random_int(0, strlen($chars) - 1)];

        }



        return $out;

    }

}


