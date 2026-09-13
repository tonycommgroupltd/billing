<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $sales_invoice['number'] }}</title>
    <style>
        @page { margin: 34px 42px; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #263548; font-family: DejaVu Sans, sans-serif; font-size: 10px; line-height: 1.5; }
        .letterhead { min-height: 74px; padding-bottom: 13px; border-bottom: 3px solid #1a73e8; }
        .logo { float: left; width: 132px; max-height: 58px; margin-right: 15px; object-fit: contain; }
        .brand { color: #1a73e8; font-size: 20px; font-weight: 700; }
        .company-line { color: #5f6f82; font-size: 8px; }
        .document-title { float: right; margin-top: -49px; text-align: right; }
        .document-title strong { display: block; color: #1a73e8; font-size: 18px; letter-spacing: .7px; }
        .document-title span { color: #65778a; font-size: 9px; }
        .clear { clear: both; }
        .open-stamp { width: 132px; margin: 18px auto 12px; padding: 6px 9px; color: #b66a08; border: 2px solid #e6a23c; border-radius: 5px; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-align: center; }
        .info { width: 100%; margin: 15px 0; border-collapse: collapse; }
        .info td { width: 50%; padding-right: 18px; vertical-align: top; }
        .label { margin: 7px 0 2px; color: #7a8b9d; font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
        .value { color: #1d2d3d; }
        .items { width: 100%; margin-top: 10px; border-collapse: collapse; }
        .items th { padding: 8px 6px; color: #fff; background: #1a73e8; font-size: 8px; text-align: left; text-transform: uppercase; }
        .items td { padding: 8px 6px; border-bottom: 1px solid #e4e9ee; vertical-align: top; }
        .items .number { text-align: right; }
        .summary { width: 47%; margin: 13px 0 18px auto; border-collapse: collapse; }
        .summary td { padding: 6px 8px; border-bottom: 1px solid #dfe6ec; }
        .summary td:last-child { text-align: right; font-weight: 700; }
        .summary .due td { color: #b45f06; background: #fff4e5; font-size: 12px; font-weight: 700; }
        .note { margin-top: 16px; padding: 10px 12px; color: #54687a; background: #e8f0fe; border-left: 3px solid #1a73e8; }
        .verification { width: 100%; margin-top: 16px; padding: 10px; background: #e8f0fe; border: 1px solid #1a73e8; border-radius: 7px; border-collapse: separate; }
        .verification td { vertical-align: middle; }
        .verification .qr { width: 98px; text-align: right; }
        .verification img { width: 90px; height: 90px; }
        .verify-url { margin-top: 4px; color: #1a73e8; font-size: 8px; }
        .footer { margin-top: 22px; padding-top: 10px; color: #8090a0; border-top: 1px solid #dfe6ec; font-size: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="letterhead">
        @if($company_logo)<img src="{{ $company_logo }}" class="logo" alt="{{ $company['name'] }}">@endif
        <div class="brand">{{ $company['name'] }}</div>
        <div class="company-line">{{ $company['address'] }}</div>
        <div class="company-line">{{ $company['email'] }} · {{ $company['website'] }}</div>
        <div class="company-line">Tel: {{ $company['phone'] }}</div>
        <div class="document-title">
            <strong>{{ $sales_invoice['is_merged'] ? 'MERGED SALES INVOICE' : 'SALES INVOICE' }}</strong>
            <span>{{ $sales_invoice['number'] }}</span>
        </div>
        <div class="clear"></div>
    </div>

    <div class="open-stamp">PAYMENT DUE</div>

    <table class="info">
        <tr>
            <td>
                <div class="label">Bill to</div>
                <div class="value"><strong>{{ $sales_invoice['customer']['name'] }}</strong></div>
                <div class="value">Customer #{{ $sales_invoice['customer']['id'] }}</div>
                <div class="value">{{ $sales_invoice['customer']['phone'] }}</div>
                @if($sales_invoice['customer']['email'])<div class="value">{{ $sales_invoice['customer']['email'] }}</div>@endif
                @if($sales_invoice['customer']['address'])<div class="value">{{ $sales_invoice['customer']['address'] }}</div>@endif
            </td>
            <td>
                <div class="label">Document details</div>
                <div class="value">Issued {{ \Illuminate\Support\Carbon::parse($sales_invoice['issued_at'])->format('d M Y') }}</div>
                @if($sales_invoice['period'])
                    <div class="value">Period {{ \Illuminate\Support\Carbon::parse($sales_invoice['period']['from'])->format('d M Y') }} – {{ \Illuminate\Support\Carbon::parse($sales_invoice['period']['to'])->format('d M Y') }}</div>
                @endif
                <div class="value">{{ count($sales_invoice['invoices']) }} outstanding invoice(s)</div>
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th>Invoice</th>
                <th>Service / plan</th>
                <th>Issued</th>
                <th>Due</th>
                <th class="number">Total</th>
                <th class="number">Paid</th>
                <th class="number">Balance</th>
            </tr>
        </thead>
        <tbody>
            @foreach($sales_invoice['invoices'] as $invoice)
                <tr>
                    <td><strong>#{{ $invoice['id'] }}</strong></td>
                    <td>{{ $invoice['service'] ?: 'Internet service' }}<br><small>{{ $invoice['plan'] }}</small></td>
                    <td>{{ \Illuminate\Support\Carbon::parse($invoice['date'])->format('d M Y') }}</td>
                    <td>{{ $invoice['due_date'] ? \Illuminate\Support\Carbon::parse($invoice['due_date'])->format('d M Y') : '—' }}</td>
                    <td class="number">KES {{ number_format($invoice['total'], 2) }}</td>
                    <td class="number">KES {{ number_format($invoice['paid'], 2) }}</td>
                    <td class="number"><strong>KES {{ number_format($invoice['balance'], 2) }}</strong></td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="summary">
        <tr><td>Total invoiced</td><td>KES {{ number_format($sales_invoice['totals']['invoiced'], 2) }}</td></tr>
        <tr><td>Payments received</td><td>KES {{ number_format($sales_invoice['totals']['paid'], 2) }}</td></tr>
        <tr class="due"><td>Amount due</td><td>KES {{ number_format($sales_invoice['totals']['balance'], 2) }}</td></tr>
    </table>

    <div class="note">
        This is an official sales invoice from {{ $company['name'] }}. Please use the relevant customer or service
        reference when paying through Paybill 4129711. A payment receipt becomes available after an invoice is fully paid.
    </div>

    <table class="verification">
        <tr>
            <td>
                <strong>Scan the QR code to verify this sales invoice online.</strong><br>
                The encrypted verification code confirms that this document was issued by {{ $company['name'] }}.
                <div class="verify-url">Verify online: {{ $verification_display_url }}</div>
            </td>
            <td class="qr"><img src="{{ $verification_qr }}" alt="Verification QR code"></td>
        </tr>
    </table>

    <div class="footer">
        {{ $company['name'] }} · Paybill 4129711 · Support {{ $company['phone'] }}<br>
        Generated {{ \Illuminate\Support\Carbon::parse($sales_invoice['issued_at'])->format('d M Y, H:i') }}
    </div>
</body>
</html>
