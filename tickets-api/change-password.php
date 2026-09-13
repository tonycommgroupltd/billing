<?php
/**
 * Change Password API (Profile)
 * 
 * Flow:
 *   1. POST /register-phone  — First time: register OTP phone number
 *   2. POST /request-otp     — Send OTP to registered phone
 *   3. POST /verify-change   — Verify OTP + old password + set new password
 *   4. GET  /phone-status    — Check if user has a registered OTP phone
 *
 * The OTP phone is locked once set. Only an admin can change it.
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
    ensureOtpPhoneColumn($db);
    ensureOtpTableReady($db);

    // Authenticate user
    $user = checkAuth();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        exit;
    }

    // Parse action from PATH_INFO or from URL path parts
    $action = '';
    if (!empty($_SERVER['PATH_INFO'])) {
        $parts = explode('/', trim($_SERVER['PATH_INFO'], '/'));
        $action = $parts[0] ?? '';
    } else {
        // Routed via index.php — parse from REQUEST_URI
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $segments = explode('/', trim($uri, '/'));
        // Find 'change-password' segment and take the next one
        $found = false;
        foreach ($segments as $seg) {
            if ($found) { $action = $seg; break; }
            if ($seg === 'change-password' || $seg === 'change-password.php') $found = true;
        }
    }

    switch ($action) {

        // ── Check if user has registered OTP phone ──
        case 'phone-status':
            if ($method !== 'GET') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit; }

            $stmt = $db->prepare("SELECT otp_phone FROM users WHERE id = ?");
            $stmt->execute([$user['id']]);
            $row = $stmt->fetch();
            $phone = $row['otp_phone'] ?? null;

            echo json_encode([
                'success' => true,
                'has_phone' => !empty($phone),
                'masked_phone' => $phone ? maskPhone($phone) : null,
            ]);
            exit;

        // ── Register OTP phone (first time only) ──
        case 'register-phone':
            if ($method !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit; }

            $data = getRequestBody();
            $phone = trim($data['phone'] ?? '');

            if (empty($phone)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Phone number is required']);
                exit;
            }

            // Normalize phone
            $normalized = normalizePhone($phone);
            if (!$normalized) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid phone number format. Use 07XXXXXXXX or 254XXXXXXXXX']);
                exit;
            }

            // Check if user already has an OTP phone registered
            $stmt = $db->prepare("SELECT otp_phone FROM users WHERE id = ?");
            $stmt->execute([$user['id']]);
            $existing = $stmt->fetch();

            if (!empty($existing['otp_phone'])) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'OTP phone already registered (' . maskPhone($existing['otp_phone']) . '). Contact admin to change it.',
                ]);
                exit;
            }

            // Send verification OTP to prove they own the number
            $otp = sprintf('%06d', mt_rand(0, 999999));
            $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

            $db->prepare("INSERT INTO otps (phone, user_id, otp, purpose, provider, status, max_attempts, expires_at, created_at, updated_at)
                          VALUES (?, ?, ?, 'phone_register', 'advantasms', 'sent', 0, ?, NOW(), NOW())")
               ->execute([$normalized, $user['id'], $otp, $expiresAt]);

            $otpId = $db->lastInsertId();

            $smsAPI = new AdvantaSMSAPI();
            $msg = "Your TonyCommGroup phone verification code is: $otp. Valid for 10 minutes. Do not share this code.";
            $smsResult = $smsAPI->sendSingleSMS($normalized, $msg, 'phone_reg_' . $otpId);

            echo json_encode([
                'success' => true,
                'message' => 'Verification code sent to ' . maskPhone($normalized),
                'otp_id' => $otpId,
            ]);
            exit;

        // ── Verify phone registration ──
        case 'verify-phone':
            if ($method !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit; }

            $data = getRequestBody();
            $otpCode = trim($data['otp'] ?? '');
            $otpId = intval($data['otp_id'] ?? 0);

            if (empty($otpCode) || !$otpId) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'OTP code and OTP ID are required']);
                exit;
            }

            // Find the OTP record
            $stmt = $db->prepare("SELECT * FROM otps WHERE id = ? AND user_id = ? AND purpose = 'phone_register' AND status = 'sent'");
            $stmt->execute([$otpId, $user['id']]);
            $otpRow = $stmt->fetch();

            if (!$otpRow) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid or expired verification request']);
                exit;
            }

            // Check expiry
            if (strtotime($otpRow['expires_at']) < time()) {
                $db->prepare("UPDATE otps SET status = 'expired', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Verification code has expired. Please request a new one.']);
                exit;
            }

            // Check attempts
            if ($otpRow['max_attempts'] >= 5) {
                $db->prepare("UPDATE otps SET status = 'failed', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Too many attempts. Please request a new code.']);
                exit;
            }

            // Increment attempts
            $db->prepare("UPDATE otps SET max_attempts = max_attempts + 1, updated_at = NOW() WHERE id = ?")->execute([$otpId]);

            // Verify OTP
            if ($otpRow['otp'] !== $otpCode) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid verification code']);
                exit;
            }

            // OTP correct — register the phone
            $db->prepare("UPDATE otps SET status = 'verified', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
            $db->prepare("UPDATE users SET otp_phone = ?, updated_at = NOW() WHERE id = ?")->execute([$otpRow['phone'], $user['id']]);

            echo json_encode([
                'success' => true,
                'message' => 'Phone number registered successfully. You can now use it for password changes.',
                'masked_phone' => maskPhone($otpRow['phone']),
            ]);
            exit;

        // ── Request OTP for password change ──
        case 'request-otp':
            if ($method !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit; }

            // Get user's registered OTP phone
            $stmt = $db->prepare("SELECT otp_phone FROM users WHERE id = ?");
            $stmt->execute([$user['id']]);
            $row = $stmt->fetch();
            $otpPhone = $row['otp_phone'] ?? null;

            if (empty($otpPhone)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'No OTP phone registered. Please register a phone number first.']);
                exit;
            }

            // Rate limit: max 1 OTP per 2 minutes
            $stmt = $db->prepare("SELECT id FROM otps WHERE user_id = ? AND purpose = 'password_change' AND status = 'sent' AND created_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE) LIMIT 1");
            $stmt->execute([$user['id']]);
            if ($stmt->fetch()) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Please wait 2 minutes before requesting another code.']);
                exit;
            }

            $otp = sprintf('%06d', mt_rand(0, 999999));
            $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

            $db->prepare("INSERT INTO otps (phone, user_id, otp, purpose, provider, status, max_attempts, expires_at, created_at, updated_at)
                          VALUES (?, ?, ?, 'password_change', 'advantasms', 'sent', 0, ?, NOW(), NOW())")
               ->execute([$otpPhone, $user['id'], $otp, $expiresAt]);

            $otpId = $db->lastInsertId();

            $smsAPI = new AdvantaSMSAPI();
            $msg = "Your TonyCommGroup password change code is: $otp. Valid for 10 minutes. Do not share this code.";
            $smsResult = $smsAPI->sendSingleSMS($otpPhone, $msg, 'pwd_change_' . $otpId);

            echo json_encode([
                'success' => true,
                'message' => 'Verification code sent to ' . maskPhone($otpPhone),
                'otp_id' => $otpId,
            ]);
            exit;

        // ── Verify OTP + change password ──
        case 'verify-change':
            if ($method !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit; }

            $data = getRequestBody();
            $otpCode = trim($data['otp'] ?? '');
            $otpId = intval($data['otp_id'] ?? 0);
            $currentPassword = $data['current_password'] ?? '';
            $newPassword = $data['new_password'] ?? '';

            // Validate inputs
            if (empty($otpCode) || !$otpId) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Verification code is required']);
                exit;
            }
            if (empty($currentPassword)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Current password is required']);
                exit;
            }
            if (empty($newPassword) || strlen($newPassword) < 6) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'New password must be at least 6 characters']);
                exit;
            }

            // Verify current password
            $stmt = $db->prepare("SELECT password FROM users WHERE id = ?");
            $stmt->execute([$user['id']]);
            $userRow = $stmt->fetch();

            if (!password_verify($currentPassword, $userRow['password'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Current password is incorrect']);
                exit;
            }

            // Find the OTP record
            $stmt = $db->prepare("SELECT * FROM otps WHERE id = ? AND user_id = ? AND purpose = 'password_change' AND status = 'sent'");
            $stmt->execute([$otpId, $user['id']]);
            $otpRow = $stmt->fetch();

            if (!$otpRow) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid or expired verification request']);
                exit;
            }

            if (strtotime($otpRow['expires_at']) < time()) {
                $db->prepare("UPDATE otps SET status = 'expired', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Verification code has expired. Please request a new one.']);
                exit;
            }

            if ($otpRow['max_attempts'] >= 5) {
                $db->prepare("UPDATE otps SET status = 'failed', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Too many attempts. Please request a new code.']);
                exit;
            }

            $db->prepare("UPDATE otps SET max_attempts = max_attempts + 1, updated_at = NOW() WHERE id = ?")->execute([$otpId]);

            if ($otpRow['otp'] !== $otpCode) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid verification code']);
                exit;
            }

            // All verified — change password
            $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);
            $db->prepare("UPDATE users SET password = ?, password_change_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([$hashedPassword, $user['id']]);
            $db->prepare("UPDATE otps SET status = 'verified', updated_at = NOW() WHERE id = ?")->execute([$otpId]);

            echo json_encode([
                'success' => true,
                'message' => 'Password changed successfully!',
            ]);
            exit;

        default:
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Unknown endpoint']);
            exit;
    }

} catch (Exception $e) {
    error_log("Change password error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An error occurred. Please try again.']);
    exit;
}

/* ============================================================ */
/* HELPER FUNCTIONS                                              */
/* ============================================================ */

function ensureOtpPhoneColumn($db) {
    // Add otp_phone column to users table if it doesn't exist
    $cols = $db->query("SHOW COLUMNS FROM users LIKE 'otp_phone'")->fetchAll();
    if (empty($cols)) {
        $db->exec("ALTER TABLE users ADD COLUMN otp_phone VARCHAR(20) DEFAULT NULL AFTER phone");
    }
}

function normalizePhone($phone) {
    $phone = preg_replace('/[^0-9+]/', '', $phone);
    if (preg_match('/^0[17]\d{8}$/', $phone)) {
        return '254' . substr($phone, 1);
    }
    if (preg_match('/^\+254\d{9}$/', $phone)) {
        return substr($phone, 1);
    }
    if (preg_match('/^254\d{9}$/', $phone)) {
        return $phone;
    }
    return null;
}

function maskPhone($phone) {
    if (strlen($phone) <= 4) return '****';
    return substr($phone, 0, 5) . '****' . substr($phone, -2);
}
