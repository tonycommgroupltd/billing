<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Service;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

class CustomerDocumentController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api')->except(['verify', 'publicDownload']);
    }

    public function index(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
            'from' => ['nullable', 'date_format:Y-m-d', 'required_with:to'],
            'to' => ['nullable', 'date_format:Y-m-d', 'required_with:from'],
        ]);

        $perPage = (int) ($validated['per_page'] ?? 20);
        $query = $this->customerInvoices($customer)
            ->leftJoin('payments', 'payments.invoice_id', '=', 'invoices.id')
            ->select([
                'invoices.id',
                'invoices.services_id',
                'invoices.invoice_date',
                'invoices.due_date',
                'invoices.total',
                'invoices.status',
                'services.mikrotik_name',
                'plans.title as plan_title',
            ])
            ->selectRaw('COALESCE(SUM(payments.sum), 0) as paid_amount')
            ->selectRaw('MAX(payments.date) as payment_date')
            ->groupBy([
                'invoices.id',
                'invoices.services_id',
                'invoices.invoice_date',
                'invoices.due_date',
                'invoices.total',
                'invoices.status',
                'services.mikrotik_name',
                'plans.title',
            ])
            ->orderByDesc('invoices.invoice_date')
            ->orderByDesc('invoices.id');

        if (! empty($validated['q'])) {
            $needle = trim($validated['q']);
            $query->where(function (Builder $builder) use ($needle) {
                $builder
                    ->where('invoices.id', $needle)
                    ->orWhere('services.mikrotik_name', 'like', "%{$needle}%")
                    ->orWhere('plans.title', 'like', "%{$needle}%");
            });
        }
        if (! empty($validated['from']) && ! empty($validated['to'])) {
            [$from, $to] = $this->periodFromValues($validated['from'], $validated['to']);
            $query->whereBetween('invoices.invoice_date', [$from, $to]);
        }

        $invoices = $query->paginate($perPage);
        $invoices->getCollection()->transform(function ($invoice) {
            $paid = (float) $invoice->paid_amount;
            $total = (float) $invoice->total;

            return [
                'id' => (int) $invoice->id,
                'invoice_date' => $invoice->invoice_date,
                'due_date' => $invoice->due_date,
                'total' => $total,
                'paid_amount' => $paid,
                'balance' => max(0, $total - $paid),
                'is_paid' => $paid >= $total,
                'payment_date' => $invoice->payment_date,
                'service' => $invoice->mikrotik_name,
                'plan' => $invoice->plan_title,
            ];
        });

        return response()->json([
            'data' => $invoices->items(),
            'meta' => [
                'page' => $invoices->currentPage(),
                'per_page' => $invoices->perPage(),
                'total' => $invoices->total(),
                'last_page' => $invoices->lastPage(),
            ],
        ]);
    }

    public function statement(Request $request, Customer $customer)
    {
        [$from, $to] = $this->validatedPeriod($request);

        return response()->json($this->buildStatement($customer, $from, $to));
    }

    public function statementPdf(Request $request, Customer $customer)
    {
        [$from, $to] = $this->validatedPeriod($request);
        $statement = $this->buildStatement($customer, $from, $to);
        $links = $this->documentLinks([
            'type' => 'statement',
            'customer_id' => $customer->id,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ]);
        $filename = sprintf(
            'Statement-%s-%s-%s.pdf',
            $customer->id,
            $from->format('Ymd'),
            $to->format('Ymd')
        );

        return Pdf::loadView('documents.statement', $this->viewData([
            'statement' => $statement,
            'verification_url' => $links['verification_url'],
        ]))
            ->setPaper('a4')
            ->download($filename);
    }

    public function receipt(Customer $customer, Invoice $invoice)
    {
        $receipt = $this->buildReceipt($customer, $invoice);
        $links = $this->documentLinks([
            'type' => 'receipt',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
        ]);

        return Pdf::loadView('documents.receipt', $this->viewData([
            'receipt' => $receipt,
            'verification_url' => $links['verification_url'],
        ]))
            ->setPaper('a4')
            ->download("Receipt-Invoice-{$invoice->id}.pdf");
    }

    public function salesInvoice(Customer $customer, Invoice $invoice)
    {
        $salesInvoice = $this->buildSalesInvoice($customer, collect([$invoice]));
        $links = $this->documentLinks([
            'type' => 'sales_invoice',
            'customer_id' => $customer->id,
            'invoice_id' => $invoice->id,
        ]);

        return Pdf::loadView('documents.sales-invoice', $this->viewData([
            'sales_invoice' => $salesInvoice,
            'verification_url' => $links['verification_url'],
        ]))
            ->setPaper('a4')
            ->download("Sales-Invoice-{$invoice->id}.pdf");
    }

    public function mergedSalesInvoice(Request $request, Customer $customer)
    {
        [$from, $to] = $this->validatedPeriod($request);
        $invoices = $this->customerInvoices($customer)
            ->whereBetween('invoices.invoice_date', [$from, $to])
            ->select('invoices.*')
            ->orderBy('invoices.invoice_date')
            ->orderBy('invoices.id')
            ->get()
            ->filter(function ($invoice) {
                return (float) Payment::where('invoice_id', $invoice->id)->sum('sum') < (float) $invoice->total;
            })
            ->values();

        if ($invoices->isEmpty()) {
            throw ValidationException::withMessages([
                'from' => ['There are no unpaid invoices in the selected period.'],
            ]);
        }

        $salesInvoice = $this->buildSalesInvoice($customer, $invoices, $from, $to);
        $links = $this->documentLinks([
            'type' => 'merged_sales_invoice',
            'customer_id' => $customer->id,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ]);

        return Pdf::loadView('documents.sales-invoice', $this->viewData([
            'sales_invoice' => $salesInvoice,
            'verification_url' => $links['verification_url'],
        ]))
            ->setPaper('a4')
            ->download("Merged-Sales-Invoice-{$customer->id}-{$from->format('Ymd')}-{$to->format('Ymd')}.pdf");
    }

    public function share(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'type' => ['required', 'in:statement,receipt'],
            'channel' => ['required', 'in:sms,email'],
            'from' => ['required_if:type,statement', 'nullable', 'date_format:Y-m-d'],
            'to' => ['required_if:type,statement', 'nullable', 'date_format:Y-m-d'],
            'invoice_id' => ['required_if:type,receipt', 'nullable', 'integer'],
        ]);

        if ($validated['type'] === 'statement') {
            [$from, $to] = $this->validatedPeriod($request);
            $this->buildStatement($customer, $from, $to);
            $payload = [
                'type' => 'statement',
                'customer_id' => $customer->id,
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ];
            $label = "account statement {$from->format('d M Y')} to {$to->format('d M Y')}";
        } else {
            $invoice = Invoice::findOrFail($validated['invoice_id']);
            $this->buildReceipt($customer, $invoice);
            $payload = [
                'type' => 'receipt',
                'customer_id' => $customer->id,
                'invoice_id' => $invoice->id,
            ];
            $label = "official receipt for Invoice #{$invoice->id}";
        }

        $links = $this->documentLinks($payload);
        $message = "Tonycomm Group Limited: Download your {$label}: {$links['download_url']} "
            ."This secure link expires {$links['expires_at']->format('d M Y')}. Help: 0110345166";

        if ($validated['channel'] === 'sms') {
            $phone = $customer->formatted_phone_no ?: format_phone($customer->phone_number);
            if (! $phone) {
                throw ValidationException::withMessages([
                    'channel' => ['This customer does not have a valid phone number.'],
                ]);
            }
            $delivery = send_sms($phone, $message, $customer->id);
            if (strtolower((string) $delivery) !== 'sent') {
                return response()->json([
                    'message' => 'The SMS gateway did not accept the document link.',
                    'delivery_status' => $delivery,
                ], 502);
            }
            $destination = $phone;
        } else {
            $email = trim((string) $customer->email);
            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw ValidationException::withMessages([
                    'channel' => ['This customer does not have a valid email address.'],
                ]);
            }
            Mail::raw($message, function ($mail) use ($email, $label) {
                $mail->to($email)->subject('Tonycomm '.$label);
            });
            $destination = $email;
        }

        return response()->json([
            'message' => ucfirst($validated['channel']).' document link sent successfully.',
            'channel' => $validated['channel'],
            'destination' => $destination,
            'expires_at' => $links['expires_at']->toIso8601String(),
        ]);
    }

    public function verify(string $token)
    {
        $payload = $this->decodeToken($token);
        $document = $this->resolveDocument($payload);

        return response()
            ->view('documents.verify', [
                'company' => config('documents.company'),
                'document' => $document,
                'verified_at' => now(),
            ])
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    public function publicDownload(string $token)
    {
        $payload = $this->decodeToken($token);
        if (empty($payload['expires_at']) || now()->timestamp > (int) $payload['expires_at']) {
            abort(410, 'This secure document download link has expired.');
        }

        $document = $this->resolveDocument($payload);
        $verificationUrl = $this->publicUrl('/api/v1/documents/verify/'.$this->encodeToken(
            collect($payload)->except('expires_at')->all()
        ));

        if ($payload['type'] === 'statement') {
            return Pdf::loadView('documents.statement', $this->viewData([
                'statement' => $document['data'],
                'verification_url' => $verificationUrl,
            ]))->setPaper('a4')->download($document['filename']);
        }
        if (in_array($payload['type'], ['sales_invoice', 'merged_sales_invoice'], true)) {
            return Pdf::loadView('documents.sales-invoice', $this->viewData([
                'sales_invoice' => $document['data'],
                'verification_url' => $verificationUrl,
            ]))->setPaper('a4')->download($document['filename']);
        }

        return Pdf::loadView('documents.receipt', $this->viewData([
            'receipt' => $document['data'],
            'verification_url' => $verificationUrl,
        ]))->setPaper('a4')->download($document['filename']);
    }

    private function buildReceipt(Customer $customer, Invoice $invoice): array
    {
        $service = Service::withTrashed()
            ->where('id', $invoice->services_id)
            ->where('customer_id', $customer->id)
            ->firstOrFail();

        $payments = Payment::where('invoice_id', $invoice->id)
            ->orderBy('date')
            ->orderBy('id')
            ->get();
        $paidAmount = (float) $payments->sum('sum');

        if ($paidAmount < (float) $invoice->total) {
            throw ValidationException::withMessages([
                'invoice_id' => ['A receipt is only available after the invoice is fully paid.'],
            ]);
        }

        $receipt = [
            'number' => 'RCT-'.str_pad((string) $invoice->id, 7, '0', STR_PAD_LEFT),
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone_number,
                'address' => $customer->address,
            ],
            'invoice' => [
                'id' => $invoice->id,
                'date' => Carbon::parse($invoice->invoice_date)->toDateString(),
                'due_date' => $invoice->due_date
                    ? Carbon::parse($invoice->due_date)->toDateString()
                    : null,
                'total' => (float) $invoice->total,
                'service' => $service->mikrotik_name,
                'plan' => $service->plan_title,
            ],
            'payments' => $payments->map(fn ($payment) => [
                'id' => $payment->id,
                'date' => Carbon::parse($payment->date)->toDateString(),
                'reference' => $payment->trans_id ?: 'PAY-'.$payment->id,
                'method' => ucfirst((string) $payment->payment_type),
                'amount' => (float) $payment->sum,
            ])->values()->all(),
            'paid_amount' => $paidAmount,
            'balance' => max(0, (float) $invoice->total - $paidAmount),
            'issued_at' => now()->toDateTimeString(),
        ];

        return $receipt;
    }

    private function buildSalesInvoice(
        Customer $customer,
        $invoices,
        ?Carbon $from = null,
        ?Carbon $to = null
    ): array {
        $rows = collect($invoices)->map(function ($invoice) use ($customer) {
            $service = Service::withTrashed()
                ->leftJoin('plans', 'plans.id', '=', 'services.plan_id')
                ->where('services.id', $invoice->services_id)
                ->where('services.customer_id', $customer->id)
                ->select([
                    'services.id',
                    'services.mikrotik_name',
                    'plans.title as plan_title',
                ])
                ->firstOrFail();
            $paid = (float) Payment::where('invoice_id', $invoice->id)->sum('sum');
            $total = (float) $invoice->total;

            return [
                'id' => (int) $invoice->id,
                'date' => Carbon::parse($invoice->invoice_date)->toDateString(),
                'due_date' => $invoice->due_date
                    ? Carbon::parse($invoice->due_date)->toDateString()
                    : null,
                'service' => $service->mikrotik_name,
                'plan' => $service->plan_title,
                'total' => $total,
                'paid' => $paid,
                'balance' => max(0, $total - $paid),
            ];
        })->values();

        if ($rows->isEmpty()) {
            abort(404);
        }

        $merged = $rows->count() > 1 || $from !== null;
        $number = $merged
            ? sprintf(
                'SINV-%d-%s-%s',
                $customer->id,
                ($from ?: Carbon::parse($rows->first()['date']))->format('Ymd'),
                ($to ?: Carbon::parse($rows->last()['date']))->format('Ymd')
            )
            : 'SINV-'.str_pad((string) $rows->first()['id'], 7, '0', STR_PAD_LEFT);

        return [
            'number' => $number,
            'is_merged' => $merged,
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone_number,
                'email' => $customer->email,
                'address' => trim(collect([$customer->address, $customer->city])->filter()->implode(', ')),
            ],
            'period' => $from && $to ? [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ] : null,
            'invoices' => $rows->all(),
            'totals' => [
                'invoiced' => round((float) $rows->sum('total'), 2),
                'paid' => round((float) $rows->sum('paid'), 2),
                'balance' => round((float) $rows->sum('balance'), 2),
            ],
            'issued_at' => now()->toDateTimeString(),
        ];
    }

    private function documentLinks(array $payload): array
    {
        $expiresAt = now()->addDays(max(1, (int) config('documents.share_days', 30)));
        $verificationToken = $this->encodeToken($payload);
        $downloadToken = $this->encodeToken($payload + ['expires_at' => $expiresAt->timestamp]);

        return [
            'verification_url' => $this->publicUrl('/api/v1/documents/verify/'.$verificationToken),
            'download_url' => $this->publicUrl('/api/v1/documents/download/'.$downloadToken),
            'expires_at' => $expiresAt,
        ];
    }

    private function resolveDocument(array $payload): array
    {
        $customer = Customer::findOrFail($payload['customer_id'] ?? null);

        if (($payload['type'] ?? null) === 'statement') {
            $from = Carbon::createFromFormat('Y-m-d', $payload['from'])->startOfDay();
            $to = Carbon::createFromFormat('Y-m-d', $payload['to'])->endOfDay();
            $statement = $this->buildStatement($customer, $from, $to);

            return [
                'type' => 'Customer statement',
                'reference' => $statement['statement_id'],
                'customer' => $customer->name,
                'period' => $from->format('d M Y').' to '.$to->format('d M Y'),
                'issued_at' => $statement['generated_at'],
                'data' => $statement,
                'filename' => "Statement-{$customer->id}-{$from->format('Ymd')}-{$to->format('Ymd')}.pdf",
            ];
        }

        if (($payload['type'] ?? null) === 'sales_invoice') {
            $invoice = Invoice::findOrFail($payload['invoice_id'] ?? null);
            $salesInvoice = $this->buildSalesInvoice($customer, collect([$invoice]));

            return [
                'type' => 'Sales invoice',
                'reference' => $salesInvoice['number'],
                'customer' => $customer->name,
                'period' => 'Invoice #'.$invoice->id,
                'issued_at' => $salesInvoice['issued_at'],
                'data' => $salesInvoice,
                'filename' => "Sales-Invoice-{$invoice->id}.pdf",
            ];
        }

        if (($payload['type'] ?? null) === 'merged_sales_invoice') {
            $from = Carbon::createFromFormat('Y-m-d', $payload['from'])->startOfDay();
            $to = Carbon::createFromFormat('Y-m-d', $payload['to'])->endOfDay();
            $invoices = $this->customerInvoices($customer)
                ->whereBetween('invoices.invoice_date', [$from, $to])
                ->select('invoices.*')
                ->orderBy('invoices.invoice_date')
                ->orderBy('invoices.id')
                ->get()
                ->filter(fn ($invoice) => (float) Payment::where('invoice_id', $invoice->id)->sum('sum') < (float) $invoice->total)
                ->values();
            abort_if($invoices->isEmpty(), 404);
            $salesInvoice = $this->buildSalesInvoice($customer, $invoices, $from, $to);

            return [
                'type' => 'Merged sales invoice',
                'reference' => $salesInvoice['number'],
                'customer' => $customer->name,
                'period' => $from->format('d M Y').' to '.$to->format('d M Y'),
                'issued_at' => $salesInvoice['issued_at'],
                'data' => $salesInvoice,
                'filename' => "Merged-Sales-Invoice-{$customer->id}-{$from->format('Ymd')}-{$to->format('Ymd')}.pdf",
            ];
        }

        if (($payload['type'] ?? null) !== 'receipt') {
            abort(404);
        }

        $invoice = Invoice::findOrFail($payload['invoice_id'] ?? null);
        $receipt = $this->buildReceipt($customer, $invoice);

        return [
            'type' => 'Paid-invoice receipt',
            'reference' => $receipt['number'],
            'customer' => $customer->name,
            'period' => 'Invoice #'.$invoice->id,
            'issued_at' => $receipt['issued_at'],
            'data' => $receipt,
            'filename' => "Receipt-Invoice-{$invoice->id}.pdf",
        ];
    }

    private function viewData(array $data): array
    {
        $logoPath = public_path(config('documents.company.logo'));
        $logo = is_file($logoPath)
            ? 'data:'.(mime_content_type($logoPath) ?: 'image/png').';base64,'.base64_encode(file_get_contents($logoPath))
            : null;

        return $data + [
            'company' => config('documents.company'),
            'company_logo' => $logo,
            'verification_qr' => $this->qrPngDataUri($data['verification_url']),
            'verification_display_url' => rtrim(config('documents.public_url'), '/')
                .'/api/v1/documents/verify',
        ];
    }

    private function qrPngDataUri(string $content): string
    {
        if (! function_exists('imagecreatetruecolor')) {
            throw new \RuntimeException('The GD extension is required to render document QR codes.');
        }

        $matrix = Encoder::encode($content, ErrorCorrectionLevel::M())->getMatrix();
        $quietZone = 4;
        $moduleSize = 4;
        $matrixSize = $matrix->getWidth();
        $imageSize = ($matrixSize + ($quietZone * 2)) * $moduleSize;
        $image = imagecreatetruecolor($imageSize, $imageSize);
        $white = imagecolorallocate($image, 255, 255, 255);
        $blue = imagecolorallocate($image, 26, 115, 232);
        imagefill($image, 0, 0, $white);

        for ($y = 0; $y < $matrixSize; $y++) {
            for ($x = 0; $x < $matrixSize; $x++) {
                if ($matrix->get($x, $y) !== 1) {
                    continue;
                }
                $left = ($x + $quietZone) * $moduleSize;
                $top = ($y + $quietZone) * $moduleSize;
                imagefilledrectangle(
                    $image,
                    $left,
                    $top,
                    $left + $moduleSize - 1,
                    $top + $moduleSize - 1,
                    $blue
                );
            }
        }

        ob_start();
        imagepng($image, null, 9);
        $png = ob_get_clean();
        imagedestroy($image);

        return 'data:image/png;base64,'.base64_encode($png);
    }

    private function encodeToken(array $payload): string
    {
        return rtrim(strtr(base64_encode($this->documentEncrypter()->encryptString(json_encode($payload))), '+/', '-_'), '=');
    }

    private function decodeToken(string $token): array
    {
        try {
            $encoded = strtr($token, '-_', '+/');
            $encoded .= str_repeat('=', (4 - strlen($encoded) % 4) % 4);
            $payload = json_decode(
                $this->documentEncrypter()->decryptString(base64_decode($encoded, true)),
                true,
                8,
                JSON_THROW_ON_ERROR
            );
        } catch (\Throwable $exception) {
            abort(404, 'The document verification code is invalid.');
        }

        return is_array($payload) ? $payload : abort(404);
    }

    private function publicUrl(string $path): string
    {
        return rtrim(config('documents.public_url'), '/').'/'.ltrim($path, '/');
    }

    private function documentEncrypter(): Encrypter
    {
        $key = (string) config('documents.encryption_key');
        if (str_starts_with($key, 'base64:')) {
            $key = base64_decode(substr($key, 7), true);
        }
        if (! is_string($key) || $key === '') {
            throw new \RuntimeException('The document encryption key is not configured.');
        }

        return new Encrypter($key, config('app.cipher', 'AES-256-CBC'));
    }

    private function validatedPeriod(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d'],
        ]);

        return $this->periodFromValues($validated['from'], $validated['to']);
    }

    private function periodFromValues(string $fromValue, string $toValue): array
    {
        $from = Carbon::createFromFormat('Y-m-d', $fromValue)->startOfDay();
        $to = Carbon::createFromFormat('Y-m-d', $toValue)->endOfDay();
        if ($from->greaterThan($to)) {
            throw ValidationException::withMessages([
                'from' => ['The start date must be before or equal to the end date.'],
            ]);
        }

        return [$from, $to];
    }

    private function buildStatement(Customer $customer, Carbon $from, Carbon $to): array
    {
        $serviceIds = Service::withTrashed()
            ->where('customer_id', $customer->id)
            ->pluck('id');

        $openingDebits = Invoice::whereIn('services_id', $serviceIds)
            ->where('invoice_date', '<', $from)
            ->sum('total');
        $openingCredits = Payment::where('customer_id', $customer->id)
            ->where('date', '<', $from)
            ->sum('sum');
        $openingBalance = (float) $openingDebits - (float) $openingCredits;

        $invoiceRows = Invoice::whereIn('invoices.services_id', $serviceIds)
            ->leftJoin('services', 'services.id', '=', 'invoices.services_id')
            ->whereBetween('invoices.invoice_date', [$from, $to])
            ->select([
                'invoices.id',
                'invoices.invoice_date as transaction_date',
                'invoices.total',
                'services.mikrotik_name',
            ])
            ->get()
            ->map(fn ($invoice) => [
                'date' => Carbon::parse($invoice->transaction_date)->toIso8601String(),
                'sort_date' => (int) Carbon::parse($invoice->transaction_date)->format('Ymd'),
                'sort_order' => 0,
                'description' => 'Invoice #'.$invoice->id
                    .($invoice->mikrotik_name ? ' - '.$invoice->mikrotik_name : ''),
                'reference' => 'INV-'.$invoice->id,
                'debit' => (float) $invoice->total,
                'credit' => 0.0,
                'type' => 'INVOICE',
            ]);

        $paymentRows = Payment::where('customer_id', $customer->id)
            ->whereBetween('date', [$from, $to])
            ->get()
            ->map(fn ($payment) => [
                'date' => Carbon::parse($payment->date)->toIso8601String(),
                'sort_date' => (int) Carbon::parse($payment->date)->format('Ymd'),
                'sort_order' => 1,
                'description' => 'Payment'
                    .($payment->invoice_id ? ' for Invoice #'.$payment->invoice_id : ''),
                'reference' => $payment->trans_id ?: 'PAY-'.$payment->id,
                'debit' => 0.0,
                'credit' => (float) $payment->sum,
                'type' => 'PAYMENT',
            ]);

        $balance = $openingBalance;
        $transactions = $invoiceRows
            ->concat($paymentRows)
            ->sortBy(fn ($row) => sprintf('%012d-%d', $row['sort_date'], $row['sort_order']))
            ->values()
            ->map(function ($row) use (&$balance) {
                $balance += $row['debit'] - $row['credit'];
                unset($row['sort_date'], $row['sort_order']);
                $row['balance'] = round($balance, 2);

                return $row;
            });

        $services = Service::withTrashed()
            ->leftJoin('plans', 'plans.id', '=', 'services.plan_id')
            ->where('services.customer_id', $customer->id)
            ->select([
                'services.id',
                'services.mikrotik_name',
                'services.price',
                'services.status',
                'plans.title as plan_name',
            ])
            ->orderBy('services.id')
            ->get()
            ->map(fn ($service) => [
                'id' => $service->id,
                'username' => $service->mikrotik_name,
                'plan' => $service->plan_name,
                'price' => (float) $service->price,
                'status' => is_array($service->status)
                    ? ($service->status['label'] ?? null)
                    : $service->status,
            ]);

        $debits = (float) $transactions->sum('debit');
        $credits = (float) $transactions->sum('credit');

        return [
            'statement_id' => sprintf(
                'STMT-%d-%s-%s',
                $customer->id,
                $from->format('Ymd'),
                $to->format('Ymd')
            ),
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone_number,
                'email' => $customer->email,
                'address' => trim(collect([$customer->address, $customer->city])->filter()->implode(', ')),
            ],
            'services' => $services,
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'opening_balance' => round($openingBalance, 2),
            'closing_balance' => round($balance, 2),
            'totals' => [
                'debits' => round($debits, 2),
                'credits' => round($credits, 2),
                'net_movement' => round($debits - $credits, 2),
            ],
            'transactions' => $transactions->all(),
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function customerInvoices(Customer $customer): Builder
    {
        return Invoice::query()
            ->join('services', 'services.id', '=', 'invoices.services_id')
            ->leftJoin('plans', 'plans.id', '=', 'services.plan_id')
            ->where('services.customer_id', $customer->id);
    }
}
