<?php
/**
 * Forgot Password API
 * Step 1: Accept email/username, find user, check if they have phone number, send OTP
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/advantasms-helper.php';

date_default_timezone_set('Africa/Nairobi');
setCorsHeaders();
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $db = getDB();
    ensureOtpTableReady($db);

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        exit;
    }

    $data = getRequestBody();
    
    // Debug: log what we received
    error_log('Forgot password request data: ' . json_encode($data));
    
    // Accept both 'identifier' (new format) and 'phone' (old format) for backward compatibility
    $identifier = trim($data['identifier'] ?? $data['phone'] ?? '');

    if (empty($identifier)) {
        error_log('Forgot password error: empty identifier/phone received. Data: ' . json_encode($data));
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Email, username, or phone number is required. Please check your input.']);
        exit;
    }

    // If it looks like a phone number (all digits or starts with 254/+254/0), search by phone first
    $isPhoneFormat = preg_match('/^[\d\+\-\s]+$/', $identifier);
    
    $user = null;
    
    if ($isPhoneFormat) {
        // Normalize phone number
        $phone = preg_replace('/[\s\-]/', '', $identifier);
        $phone = ltrim($phone, '+');
        if (preg_match('/^0/', $phone)) {
            $phone = '254' . substr($phone, 1);
        }
        
        // Search by phone
        $stmt = $db->prepare("SELECT id, name, email, otp_phone, phone FROM users WHERE deleted_at IS NULL AND (otp_phone = ? OR phone = ?)");
        $stmt->execute([$phone, $phone]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        error_log('Phone lookup for "' . $identifier . '" (normalized to ' . $phone . '): ' . ($user ? 'Found user ID ' . $user['id'] : 'No user found'));
    } else {
        // Search by email or name
        $stmt = $db->prepare("SELECT id, name, email, otp_phone, phone FROM users WHERE deleted_at IS NULL AND (email = ? OR name = ?)");
        $stmt->execute([$identifier, $identifier]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        error_log('Email/name lookup for "' . $identifier . '": ' . ($user ? 'Found user ID ' . $user['id'] : 'No user found'));
    }

    if (!$user) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No account found. Please verify your email, username, or phone number and try again.']);
        exit;
    }

    // Check if user has a phone number - use otp_phone first, fall back to phone field
    $otpPhone = !empty($user['otp_phone']) ? $user['otp_phone'] : (!empty($user['phone']) ? $user['phone'] : null);
    
    if (empty($otpPhone)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No phone number found for your account. Please contact the administrator to add your phone number.']);
        exit;
    }

    // Validate phone number format
    $phone = preg_replace('/[\s\-]/', '', $otpPhone);
    $phone = ltrim($phone, '+');
    if (preg_match('/^0/', $phone)) {
        $phone = '254' . substr($phone, 1);
    }
    if (!preg_match('/^254\d{9}$/', $phone)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid phone number format. Please contact the administrator to update your phone number.']);
        exit;
    }

    // Rate limit: max 1 OTP per 2 minutes
    $stmt = $db->prepare("SELECT id FROM otps WHERE user_id = ? AND purpose = 'password_reset' AND status = 'sent' AND created_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE) LIMIT 1");
    $stmt->execute([$user['id']]);
    if ($stmt->fetch()) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Please wait 2 minutes before requesting another code.']);
        exit;
    }

    // Generate OTP
    $otp = sprintf('%06d', mt_rand(0, 999999));
    $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

    $db->prepare("INSERT INTO otps (phone, user_id, otp, purpose, provider, status, max_attempts, expires_at, created_at, updated_at)
                  VALUES (?, ?, ?, 'password_reset', 'advantasms', 'sent', 0, ?, NOW(), NOW())")
       ->execute([$phone, $user['id'], $otp, $expiresAt]);

    $otpId = $db->lastInsertId();

    // Send OTP via SMS
    $smsAPI = new AdvantaSMSAPI();
    $message = "Your TonyCommGroup password reset code is: $otp. Valid for 10 minutes. Do not share this code.";
    $smsResult = $smsAPI->sendSingleSMS($phone, $message, 'pwd_reset_' . $otpId);
    error_log('Forgot password SMS result: ' . json_encode($smsResult));

    // Mask phone for display
    $masked = strlen($phone) > 4 ? substr($phone, 0, 5) . '****' . substr($phone, -2) : '****';

    echo json_encode([
        'success' => true,
        'message' => 'Verification code sent to ' . $masked,
        'username' => $user['name'],
        'otp_id' => $otpId,
        'masked_phone' => $masked,
        'user_id' => $user['id'],
    ]);

} catch (Exception $e) {
    error_log('Forgot password error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An error occurred. Please try again later.']);
}
?>

