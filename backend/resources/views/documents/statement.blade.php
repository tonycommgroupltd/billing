<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $statement['statement_id'] }}</title>
    <style>
        @page { margin: 28px 34px; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #263548; font-family: DejaVu Sans, sans-serif; font-size: 10px; line-height: 1.45; }
        .letterhead { min-height: 72px; padding-bottom: 13px; border-bottom: 3px solid #1a73e8; }
        .logo { float: left; width: 132px; max-height: 58px; margin-right: 15px; object-fit: contain; }
        .brand { color: #1a73e8; font-size: 20px; font-weight: 700; letter-spacing: -.4px; }
        .company-line { color: #5f6f82; font-size: 8px; }
        .document-title { float: right; margin-top: -49px; text-align: right; }
        .document-title strong { display: block; color: #1a73e8; font-size: 18px; letter-spacing: .5px; }
        .document-title span { color: #65778a; font-size: 8px; }
        .clear { clear: both; }
        .info-grid { width: 100%; margin: 18px 0 14px; border-collapse: collapse; }
        .info-grid td { width: 50%; padding: 0 16px 0 0; vertical-align: top; }
        .label { margin-bottom: 3px; color: #7a8b9d; font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
        .value { margin-bottom: 3px; color: #1d2d3d; font-size: 10px; }
        .summary { width: 100%; margin: 12px 0 18px; border-collapse: separate; border-spacing: 6px 0; }
        .summary td { width: 25%; padding: 10px; background: #e8f0fe; border: 1px solid #c8daf8; border-radius: 6px; }
        .summary .amount { display: block; margin-top: 3px; color: #155ab6; font-size: 13px; font-weight: 700; }
        h3 { margin: 14px 0 7px; color: #1a73e8; font-size: 11px; }
        table.transactions { width: 100%; border-collapse: collapse; }
        .transactions th { padding: 8px 6px; color: #fff; background: #1a73e8; font-size: 8px; letter-spacing: .3px; text-align: left; text-transform: uppercase; }
        .transactions td { padding: 7px 6px; border-bottom: 1px solid #e4e9ee; vertical-align: top; }
        .transactions tr:nth-child(even) td { background: #f8fafb; }
        .transactions .number { text-align: right; white-space: nowrap; }
        .empty { padding: 24px !important; color: #7a8b9d; text-align: center; }
        .services { margin-top: 6px; color: #54687a; font-size: 8px; }
        .verification { width: 100%; margin-top: 16px; padding: 10px; background: #e8f0fe; border: 1px solid #1a73e8; border-radius: 7px; border-collapse: separate; }
        .verification td { vertical-align: middle; }
        .verification .qr { width: 96px; text-align: right; }
        .verification img { width: 88px; height: 88px; }
        .verify-url { margin-top: 4px; color: #1a73e8; font-size: 8px; }
        .footer { margin-top: 14px; padding-top: 9px; color: #8090a0; border-top: 1px solid #dfe6ec; font-size: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="letterhead">
        @if($company_logo)<img src="{{ $company_logo }}" class="logo" alt="Tonycomm Group Limited">@endif
        <div class="brand">{{ $company['name'] }}</div>
        <div class="company-line">{{ $company['address'] }}</div>
        <div class="company-line">{{ $company['email'] }} · {{ $company['website'] }}</div>
        <div class="company-line">Tel: {{ $company['phone'] }}</div>
        <div class="document-title">
            <strong>ACCOUNT STATEMENT</strong>
            <span>{{ $statement['statement_id'] }}</span>
        </div>
        <div class="clear"></div>
    </div>

    <table class="info-grid">
        <tr>
            <td>
                <div class="label">Statement for</div>
                <div class="value"><strong>{{ $statement['customer']['name'] }}</strong></div>
                <div class="value">Customer #{{ $statement['customer']['id'] }}</div>
                <div class="value">{{ $statement['customer']['phone'] ?: 'No phone number' }}</div>
                @if($statement['customer']['email'])<div class="value">{{ $statement['customer']['email'] }}</div>@endif
                @if($statement['customer']['address'])<div class="value">{{ $statement['customer']['address'] }}</div>@endif
            </td>
            <td>
                <div class="label">Statement period</div>
                <div class="value"><strong>{{ \Illuminate\Support\Carbon::parse($statement['period']['from'])->format('d M Y') }} – {{ \Illuminate\Support\Carbon::parse($statement['period']['to'])->format('d M Y') }}</strong></div>
                <div class="label" style="margin-top:10px">Generated</div>
                <div class="value">{{ \Illuminate\Support\Carbon::parse($statement['generated_at'])->format('d M Y, H:i') }}</div>
                @if(count($statement['services']))
                    <div class="services">
                        Services:
                        {{ collect($statement['services'])->map(fn($service) => trim(($service['username'] ?: 'Service #'.$service['id']).($service['plan'] ? ' · '.$service['plan'] : '')))->implode(', ') }}
                    </div>
                @endif
            </td>
        </tr>
    </table>

    <table class="summary">
        <tr>
            <td><div class="label">Opening balance</div><span class="amount">KES {{ number_format($statement['opening_balance'], 2) }}</span></td>
            <td><div class="label">Total invoices</div><span class="amount">KES {{ number_format($statement['totals']['debits'], 2) }}</span></td>
            <td><div class="label">Total payments</div><span class="amount">KES {{ number_format($statement['totals']['credits'], 2) }}</span></td>
            <td><div class="label">Closing balance</div><span class="amount">KES {{ number_format($statement['closing_balance'], 2) }}</span></td>
        </tr>
    </table>

    <h3>Transaction history</h3>
    <table class="transactions">
        <thead>
            <tr>
                <th style="width:12%">Date</th>
                <th style="width:34%">Description</th>
                <th style="width:16%">Reference</th>
                <th class="number" style="width:12%">Debit</th>
                <th class="number" style="width:12%">Credit</th>
                <th class="number" style="width:14%">Balance</th>
            </tr>
        </thead>
        <tbody>
            @forelse($statement['transactions'] as $transaction)
                <tr>
                    <td>{{ \Illuminate\Support\Carbon::parse($transaction['date'])->format('d M Y') }}</td>
                    <td>{{ $transaction['description'] }}</td>
                    <td>{{ $transaction['reference'] }}</td>
                    <td class="number">{{ $transaction['debit'] ? number_format($transaction['debit'], 2) : '—' }}</td>
                    <td class="number">{{ $transaction['credit'] ? number_format($transaction['credit'], 2) : '—' }}</td>
                    <td class="number"><strong>{{ number_format($transaction['balance'], 2) }}</strong></td>
                </tr>
            @empty
                <tr><td colspan="6" class="empty">No billing activity was recorded during this period.</td></tr>
            @endforelse
        </tbody>
    </table>

    <table class="verification">
        <tr>
            <td>
                <h3 style="margin:0 0 4px">Electronic document verification</h3>
                <strong>Scan the QR code to verify this statement online.</strong><br>
                This computer-generated statement is protected by an encrypted verification code and does not require a signature.
                <div class="verify-url">Verify online: {{ $verification_display_url }}</div>
            </td>
            <td class="qr"><img src="{{ $verification_qr }}" alt="Verification QR code"></td>
        </tr>
    </table>

    <div class="footer">
        {{ $company['name'] }} · Paybill 4129711 · Support {{ $company['phone'] }}<br>
        This statement was generated from the live billing ledger.
    </div>
</body>
</html>
