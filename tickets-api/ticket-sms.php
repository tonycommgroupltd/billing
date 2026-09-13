<?php
/**
 * Homelink ticket SMS — HostPinnacle sender HOMELINK.
 * Credentials come from config.local.php homelink_sms / env, never hardcoded here.
 */

function homelinkSmsCareNumber() {
    $cfg = homelinkSmsConfig();
    return $cfg['care_number'] ?: '0700 661 060';
}

function homelinkSmsConfig() {
    $cfg = [];
    if (function_exists('loadAppConfig')) {
        try {
            $all = loadAppConfig();
            $cfg = is_array($all['homelink_sms'] ?? null) ? $all['homelink_sms'] : [];
            if (!$cfg && is_array($all['advanta_sms'] ?? null) && strtoupper((string)($all['advanta_sms']['shortcode'] ?? '')) === 'HOMELINK') {
                $cfg = $all['advanta_sms'];
            }
        } catch (Throwable $e) {
            $cfg = [];
        }
    }

    $care = getenv('HOMELINK_CARE_NUMBER') ?: ($cfg['care_number'] ?? '0700 661 060');

    return [
        'api_key' => getenv('SMS_API_KEY') ?: ($cfg['api_key'] ?? ''),
        'api_url' => getenv('SMS_API_URL') ?: ($cfg['api_url'] ?? 'https://smsportal.hostpinnacle.co.ke/SMSApi/send'),
        'sender_name' => getenv('SMS_SENDER_ID') ?: ($cfg['sender_id'] ?? $cfg['shortcode'] ?? $cfg['sender_name'] ?? 'HOMELINK'),
        'username' => getenv('SMS_USER_ID') ?: ($cfg['username'] ?? $cfg['user_id'] ?? ''),
        'password' => getenv('SMS_PASSWORD') ?: ($cfg['password'] ?? ''),
        'care_number' => $care,
    ];
}

function sendHomelinkSms($mobile, $message, $clientSmsId = null) {
    $mobile = trim((string)$mobile);
    $message = trim((string)$message);
    if ($mobile === '' || $message === '') {
        return ['success' => false, 'error' => 'missing_mobile_or_message'];
    }

    $config = homelinkSmsConfig();
    if ($config['api_key'] === '' && ($config['username'] === '' || $config['password'] === '')) {
        error_log('Homelink SMS skipped: missing credentials in config.local.php homelink_sms');
        return ['success' => false, 'error' => 'missing_credentials'];
    }

    $digits = preg_replace('/\D/', '', $mobile);
    if (str_starts_with($digits, '0') && strlen($digits) === 10) {
        $digits = '254' . substr($digits, 1);
    } elseif (strlen($digits) === 9) {
        $digits = '254' . $digits;
    }
    if (strlen($digits) < 12) {
        return ['success' => false, 'error' => 'invalid_mobile'];
    }

    $msgType = preg_match('/[^\x00-\x7F]/', $message) ? 'unicode' : 'text';
    $fields = [
        'sendMethod' => 'quick',
        'mobile' => $digits,
        'msg' => $message,
        'senderid' => $config['sender_name'] ?: 'HOMELINK',
        'msgType' => $msgType,
        'duplicatecheck' => 'true',
        'output' => 'json',
    ];
    if ($clientSmsId) {
        $fields['clientsmsid'] = $clientSmsId;
    }
    if ($config['username'] !== '' && $config['password'] !== '') {
        $fields['userid'] = $config['username'];
        $fields['password'] = $config['password'];
    }

    $headers = [
        'cache-control: no-cache',
        'content-type: application/x-www-form-urlencoded',
    ];
    if ($config['api_key'] !== '') {
        $headers[] = 'apikey: ' . $config['api_key'];
    }

    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => $config['api_url'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_HTTPHEADER => $headers,
    ]);
    $response = curl_exec($curl);
    $httpCode = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    $parsed = json_decode((string)$response, true);
    $status = strtolower((string)($parsed['status'] ?? ($parsed['response']['status'] ?? '')));
    $statusCode = (string)($parsed['statusCode'] ?? ($parsed['response']['code'] ?? ''));
    $ok = !$curlError && ($status === 'success' || $statusCode === '200' || $httpCode === 200);

    if (!$ok) {
        error_log('Homelink SMS failed: ' . ($curlError ?: ($parsed['reason'] ?? $parsed['msg'] ?? substr((string)$response, 0, 200))));
    }

    return [
        'success' => $ok,
        'http_code' => $httpCode,
        'parsed' => $parsed,
        'error' => $ok ? null : ($curlError ?: 'send_failed'),
    ];
}

function ticketFirstName($name) {
    $name = trim((string)$name);
    if ($name === '' || stripos($name, 'phone:') === 0) {
        return 'there';
    }
    $parts = preg_split('/\s+/', $name);
    return $parts[0] ?: 'there';
}

function ticketAssigneeList($assignedTo) {
    if (is_array($assignedTo)) {
        $raw = $assignedTo;
    } elseif (is_string($assignedTo) && trim($assignedTo) !== '') {
        $decoded = json_decode($assignedTo, true);
        $raw = is_array($decoded) ? $decoded : [$assignedTo];
    } else {
        $raw = [];
    }
    $out = [];
    foreach ($raw as $item) {
        $item = trim((string)$item);
        if ($item === '' || $item === '0' || strcasecmp($item, 'unassigned') === 0) {
            continue;
        }
        $out[] = $item;
    }
    return array_values(array_unique($out));
}

function ticketAssigneeLabel($assignedTo) {
    $names = ticketAssigneeList($assignedTo);
    if (!$names) {
        return 'our Homelink team';
    }
    if (count($names) === 1) {
        return $names[0];
    }
    $last = array_pop($names);
    return implode(', ', $names) . ' and ' . $last;
}

function ticketAssigneeContacts($db, $assignedTo) {
    $names = ticketAssigneeList($assignedTo);
    $contacts = [];
    foreach ($names as $name) {
        try {
            $stmt = $db->prepare("SELECT id, name, email, phone FROM users WHERE deleted_at IS NULL AND (name = ? OR email = ?) LIMIT 1");
            $stmt->execute([$name, $name]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user && !empty($user['phone'])) {
                $contacts[] = $user;
            } else {
                error_log("Ticket SMS: no phone for assignee '{$name}'");
            }
        } catch (Throwable $e) {
            error_log('Ticket SMS assignee lookup failed: ' . $e->getMessage());
        }
    }
    return $contacts;
}

function homelinkStatusSms($status, $customerName, $ticketNumber, $subject = '') {
    $care = homelinkSmsCareNumber();
    $hi = ticketFirstName($customerName);
    $ticket = $ticketNumber ?: 'your ticket';
    $subjectBit = trim((string)$subject);
    $subjectBit = $subjectBit !== '' ? " ({$subjectBit})" : '';

    $templates = [
        'new' => "Hi {$hi}, Homelink has received ticket {$ticket}{$subjectBit}. We'll keep you posted. Need us? Call {$care}.",
        'open' => "Hi {$hi}, good news — Homelink is now working on ticket {$ticket}. Hang tight, we'll update you. {$care}",
        'in_progress' => "Hi {$hi}, your Homelink ticket {$ticket} is in progress. Our technician is on it. Asante. {$care}",
        'pending' => "Hi {$hi}, ticket {$ticket} is pending a short check. We'll be in touch soon. Homelink {$care}",
        'waiting_customer' => "Hi {$hi}, we need a quick word about Homelink ticket {$ticket}. Please call us on {$care} when you can.",
        'waiting_on_customer' => "Hi {$hi}, we need a quick word about Homelink ticket {$ticket}. Please call us on {$care} when you can.",
        'waiting_power' => "Hi {$hi}, ticket {$ticket} is on a short hold while we wait for power/signal. We'll continue as soon as it's ready. Homelink {$care}",
        'power_available' => "Hi {$hi}, power is back — Homelink will continue ticket {$ticket} shortly. {$care}",
        'customer_unreachable' => "Hi {$hi}, we couldn't reach you about ticket {$ticket}. Please call Homelink on {$care} so we can help.",
        'booked_later' => "Hi {$hi}, ticket {$ticket} is booked for a later visit. We'll call before we come. Homelink {$care}",
        'out_of_range' => "Hi {$hi}, after a check, ticket {$ticket} is currently outside coverage. We'll notify you when Homelink reaches you. {$care}",
        'pole_needed' => "Hi {$hi}, ticket {$ticket} needs a pole first. We're arranging it and will update you. Homelink {$care}",
        'long_distance' => "Hi {$hi}, ticket {$ticket} needs a bit more planning because of the distance. We'll share the visit time soon. Homelink {$care}",
        'installed_elsewhere' => "Hi {$hi}, we noted ticket {$ticket} may no longer be needed. If you'd still like Homelink, call {$care}.",
        'installation_complete' => "Hi {$hi}, your Homelink installation {$ticket} is complete. Karibu! Need help? Call {$care}.",
        'installation complete' => "Hi {$hi}, your Homelink installation {$ticket} is complete. Karibu! Need help? Call {$care}.",
        'resolved' => "Hi {$hi}, great news — Homelink ticket {$ticket} is resolved. Anything else? Call {$care}. Karibu tena.",
        'closed' => "Hi {$hi}, Homelink ticket {$ticket} is now closed. Asante. We're here on {$care} if you need us.",
        'on_hold' => "Hi {$hi}, ticket {$ticket} is on hold for a moment. We'll continue shortly. Homelink {$care}",
        'cancelled' => "Hi {$hi}, Homelink ticket {$ticket} has been cancelled. If that was a mistake, call {$care}.",
    ];

    $key = strtolower(trim((string)$status));
    $keyNorm = str_replace([' ', '-'], '_', $key);
    if (isset($templates[$key])) {
        return $templates[$key];
    }
    if (isset($templates[$keyNorm])) {
        return $templates[$keyNorm];
    }
    $label = trim(str_replace('_', ' ', $keyNorm));
    if ($label === '') {
        $label = 'updated';
    }
    return "Hi {$hi}, a quick Homelink update on ticket {$ticket}: it is now {$label}. Asante. Call {$care} anytime.";
}

function sendTicketCreatedSms($db, $ticket) {
    try {
        $number = $ticket['number'] ?: ('#' . ($ticket['id'] ?? ''));
        $subject = trim((string)($ticket['subject'] ?? ''));
        $address = trim((string)($ticket['address'] ?? ''));
        $customerName = $ticket['customer_name'] ?? '';
        $customerPhone = $ticket['customer_phone'] ?? '';
        $assigneeLabel = ticketAssigneeLabel($ticket['assigned_to'] ?? null);
        $care = homelinkSmsCareNumber();
        $hi = ticketFirstName($customerName);

        if (!empty($customerPhone)) {
            $who = ($assigneeLabel === 'our Homelink team')
                ? 'our Homelink team will pick it up shortly'
                : "it has been assigned to {$assigneeLabel}";
            $msg = "Hi {$hi}, Homelink has created ticket {$number}";
            if ($subject !== '') {
                $msg .= " ({$subject})";
            }
            $msg .= ". {$who}. We'll keep you updated. Need us? Call {$care}.";
            sendHomelinkSms($customerPhone, $msg, 'ticket-created-' . ($ticket['id'] ?? time()));
        }

        $contacts = ticketAssigneeContacts($db, $ticket['assigned_to'] ?? null);
        foreach ($contacts as $tech) {
            $techMsg = "Homelink ticket {$number} has been assigned to you.";
            if ($subject !== '') {
                $techMsg .= " Subject: {$subject}.";
            }
            if ($customerName !== '' && stripos($customerName, 'phone:') !== 0) {
                $techMsg .= " Customer: {$customerName}.";
            }
            if (!empty($customerPhone)) {
                $techMsg .= " Phone: {$customerPhone}.";
            }
            $techMsg .= $address !== '' ? " Address: {$address}." : " Address: not given — please confirm with the customer.";
            $techMsg .= " Homelink {$care}";
            sendHomelinkSms($tech['phone'], $techMsg, 'ticket-assigned-' . ($ticket['id'] ?? time()) . '-' . ($tech['id'] ?? 'x'));
        }
    } catch (Throwable $e) {
        error_log('sendTicketCreatedSms failed: ' . $e->getMessage());
    }
}

function sendTicketStatusSms($ticket, $status) {
    try {
        $phone = $ticket['customer_phone'] ?? '';
        if ($phone === '') {
            return false;
        }
        $number = $ticket['number'] ?: ('#' . ($ticket['id'] ?? ''));
        $message = homelinkStatusSms(
            $status,
            $ticket['customer_name'] ?? '',
            $number,
            $ticket['subject'] ?? ''
        );
        sendHomelinkSms($phone, $message, 'ticket-status-' . ($ticket['id'] ?? 'x') . '-' . preg_replace('/\W+/', '', strtolower((string)$status)));
        return true;
    } catch (Throwable $e) {
        error_log('sendTicketStatusSms failed: ' . $e->getMessage());
        return false;
    }
}
