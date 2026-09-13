<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $receipt['number'] }}</title>
    <style>
        @page { margin: 34px 42px; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #263548; font-family: DejaVu Sans, sans-serif; font-size: 10px; line-height: 1.5; }
        .letterhead { min-height: 74px; padding-bottom: 13px; border-bottom: 3px solid #1a73e8; }
        .logo { float: left; width: 132px; max-height: 58px; margin-right: 15px; object-fit: contain; }
        .brand { color: #1a73e8; font-size: 20px; font-weight: 700; }
        .company-line { color: #5f6f82; font-size: 8px; }
        .receipt-title { float: right; margin-top: -49px; text-align: right; }
        .receipt-title strong { display: block; color: #1a73e8; font-size: 18px; letter-spacing: .7px; }
        .receipt-title span { color: #65778a; font-size: 9px; }
        .clear { clear: both; }
        .paid-stamp { width: 104px; margin: 20px auto 14px; padding: 7px 10px; color: #11875d; border: 2px solid #20a875; border-radius: 5px; font-size: 15px; font-weight: 700; letter-spacing: 2px; text-align: center; transform: rotate(-3deg); }
        .info { width: 100%; margin: 18px 0; border-collapse: collapse; }
        .info td { width: 50%; padding: 0 18px 0 0; vertical-align: top; }
        .label { margin: 8px 0 2px; color: #7a8b9d; font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
        .value { color: #1d2d3d; }
        .summary { margin: 8px 0 20px; padding: 16px 18px; background: #eef8f4; border: 1px solid #caeadd; border-radius: 7px; }
        .summary-table { width: 100%; border-collapse: collapse; }
        .summary-table td { width: 33.33%; }
        .summary-table td:last-child { text-align: right; }
        .amount { color: #11875d; font-size: 19px; font-weight: 700; }
        h3 { margin: 18px 0 8px; color: #1a73e8; font-size: 11px; }
        .payments { width: 100%; border-collapse: collapse; }
        .payments th { padding: 8px 7px; color: #fff; background: #1a73e8; font-size: 8px; text-align: left; text-transform: uppercase; }
        .payments td { padding: 8px 7px; border-bottom: 1px solid #e4e9ee; }
        .payments .number { text-align: right; }
        .total-row td { color: #17324d; font-weight: 700; background: #f4f7f9; }
        .note { margin-top: 18px; padding: 10px 12px; color: #54687a; background: #e8f0fe; border-left: 3px solid #1a73e8; }
        .verification { width: 100%; margin-top: 16px; padding: 10px; background: #e8f0fe; border: 1px solid #1a73e8; border-radius: 7px; border-collapse: separate; }
        .verification td { vertical-align: middle; }
        .verification .qr { width: 98px; text-align: right; }
        .verification img { width: 90px; height: 90px; }
        .verify-url { margin-top: 4px; color: #1a73e8; font-size: 8px; }
        .footer { margin-top: 24px; padding-top: 10px; color: #8090a0; border-top: 1px solid #dfe6ec; font-size: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="letterhead">
        @if($company_logo)<img src="{{ $company_logo }}" class="logo" alt="Tonycomm Group Limited">@endif
        <div class="brand">{{ $company['name'] }}</div>
        <div class="company-line">{{ $company['address'] }}</div>
        <div class="company-line">{{ $company['email'] }} · {{ $company['website'] }}</div>
        <div class="company-line">Tel: {{ $company['phone'] }}</div>
        <div class="receipt-title">
            <strong>PAYMENT RECEIPT</strong>
            <span>{{ $receipt['number'] }}</span>
        </div>
        <div class="clear"></div>
    </div>

    <div class="paid-stamp">PAID</div>

    <table class="info">
        <tr>
            <td>
                <div class="label">Received from</div>
                <div class="value"><strong>{{ $receipt['customer']['name'] }}</strong></div>
                <div class="value">Customer #{{ $receipt['customer']['id'] }}</div>
                <div class="value">{{ $receipt['customer']['phone'] }}</div>
                @if($receipt['customer']['address'])<div class="value">{{ $receipt['customer']['address'] }}</div>@endif
            </td>
            <td>
                <div class="label">Invoice</div>
                <div class="value"><strong>Invoice #{{ $receipt['invoice']['id'] }}</strong></div>
                <div class="value">Issued {{ \Illuminate\Support\Carbon::parse($receipt['invoice']['date'])->format('d M Y') }}</div>
                @if($receipt['invoice']['service'])<div class="value">Account: {{ $receipt['invoice']['service'] }}</div>@endif
                @if($receipt['invoice']['plan'])<div class="value">{{ $receipt['invoice']['plan'] }}</div>@endif
            </td>
        </tr>
    </table>

    <div class="summary">
        <table class="summary-table">
            <tr>
                <td><div class="label">Invoice total</div><strong>KES {{ number_format($receipt['invoice']['total'], 2) }}</strong></td>
                <td><div class="label">Balance due</div><strong>KES {{ number_format($receipt['balance'], 2) }}</strong></td>
                <td><div class="label">Amount received</div><span class="amount">KES {{ number_format($receipt['paid_amount'], 2) }}</span></td>
            </tr>
        </table>
    </div>

    <h3>Payments applied to this invoice</h3>
    <table class="payments">
        <thead>
            <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Payment method</th>
                <th class="number">Amount</th>
            </tr>
        </thead>
        <tbody>
            @foreach($receipt['payments'] as $payment)
                <tr>
                    <td>{{ \Illuminate\Support\Carbon::parse($payment['date'])->format('d M Y') }}</td>
                    <td>{{ $payment['reference'] }}</td>
                    <td>{{ $payment['method'] }}</td>
                    <td class="number">KES {{ number_format($payment['amount'], 2) }}</td>
                </tr>
            @endforeach
            <tr class="total-row">
                <td colspan="3">Total received</td>
                <td class="number">KES {{ number_format($receipt['paid_amount'], 2) }}</td>
            </tr>
        </tbody>
    </table>

    <div class="note">
        This consolidated receipt confirms that Invoice #{{ $receipt['invoice']['id'] }} has been fully paid.
        Please retain it for your records.
    </div>

    <table class="verification">
        <tr>
            <td>
                <h3 style="margin:0 0 4px">Official receipt verification</h3>
                <strong>Scan the QR code to verify this paid-invoice receipt online.</strong><br>
                The encrypted verification code confirms that this receipt was issued by {{ $company['name'] }}.
                <div class="verify-url">Verify online: {{ $verification_display_url }}</div>
            </td>
            <td class="qr"><img src="{{ $verification_qr }}" alt="Verification QR code"></td>
        </tr>
    </table>

    <div class="footer">
        {{ $company['name'] }} · Paybill 4129711 · Support {{ $company['phone'] }}<br>
        Generated {{ \Illuminate\Support\Carbon::parse($receipt['issued_at'])->format('d M Y, H:i') }}
    </div>
</body>
</html>
