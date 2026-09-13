<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verified document · {{ $company['name'] }}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 32px 16px; color: #263548; background: #f4f7fb; font-family: Arial, sans-serif; }
        .card { max-width: 620px; margin: 0 auto; overflow: hidden; background: #fff; border: 1px solid #dce5ef; border-radius: 18px; box-shadow: 0 18px 50px rgba(35, 67, 105, .12); }
        .head { padding: 28px 32px; color: #fff; background: #1a73e8; }
        .head h1 { margin: 0; font-size: 24px; }
        .head p { margin: 7px 0 0; color: #dceaff; }
        .body { padding: 30px 32px; }
        .verified { display: inline-flex; align-items: center; margin-bottom: 24px; padding: 8px 13px; color: #087a55; font-size: 13px; font-weight: 700; background: #e5f8f1; border-radius: 999px; }
        .verified span { display: inline-grid; width: 22px; height: 22px; margin-right: 8px; color: white; background: #18a875; border-radius: 50%; place-items: center; }
        dl { margin: 0; }
        .row { display: grid; grid-template-columns: 150px 1fr; gap: 14px; padding: 13px 0; border-bottom: 1px solid #edf1f5; }
        dt { color: #7b8da1; font-size: 12px; font-weight: 700; text-transform: uppercase; }
        dd { margin: 0; font-weight: 600; }
        .notice { margin-top: 24px; padding: 14px; color: #4e6380; background: #e8f0fe; border-left: 4px solid #1a73e8; border-radius: 6px; font-size: 13px; line-height: 1.5; }
        .footer { padding: 20px 32px; color: #6f8093; background: #f8fafc; font-size: 12px; text-align: center; }
        @media (max-width: 520px) { .head, .body, .footer { padding-left: 20px; padding-right: 20px; } .row { grid-template-columns: 1fr; gap: 4px; } }
    </style>
</head>
<body>
    <main class="card">
        <header class="head">
            <h1>{{ $company['name'] }}</h1>
            <p>Secure electronic document verification</p>
        </header>
        <section class="body">
            <div class="verified"><span>✓</span> Authentic document</div>
            <dl>
                <div class="row"><dt>Document</dt><dd>{{ $document['type'] }}</dd></div>
                <div class="row"><dt>Reference</dt><dd>{{ $document['reference'] }}</dd></div>
                <div class="row"><dt>Customer</dt><dd>{{ $document['customer'] }}</dd></div>
                <div class="row"><dt>Related period</dt><dd>{{ $document['period'] }}</dd></div>
                <div class="row"><dt>Verified at</dt><dd>{{ $verified_at->format('d M Y, H:i T') }}</dd></div>
            </dl>
            <div class="notice">
                The encrypted QR verification code is valid and the referenced document exists in the live Tonycomm billing system.
                For assistance, call {{ $company['phone'] }}.
            </div>
        </section>
        <footer class="footer">{{ $company['name'] }} · {{ $company['website'] }}</footer>
    </main>
</body>
</html>
