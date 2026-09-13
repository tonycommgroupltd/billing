<?php
/**
 * Reset Password API
 * Step 2: Verify OTP code + set new password
 * Requires otp_id, otp code, user_id, and new password
 */

require_once __DIR__ . '/helpers.php';

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
    $otpId = intval($data['otp_id'] ?? 0);
    $otpCode = trim($data['otp'] ?? '');
    $userId = intval($data['user_id'] ?? 0);
    $newPassword = $data['password'] ?? '';

    // Validate inputs
    if (!$otpId || empty($otpCode)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Verification code is required']);
        exit;
    }
    if (!$userId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid request']);
        exit;
    }
    if (empty($newPassword) || strlen($newPassword) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Password must be at least 6 characters']);
        exit;
    }

    // Find the OTP record
    $stmt = $db->prepare("SELECT * FROM otps WHERE id = ? AND user_id = ? AND purpose = 'password_reset' AND status = 'sent'");
    $stmt->execute([$otpId, $userId]);
    $otpRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$otpRow) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid or expired verification request. Please start over.']);
        exit;
    }

    // Check expiry
    if (strtotime($otpRow['expires_at']) < time()) {
        $db->prepare("UPDATE otps SET status = 'expired', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Verification code has expired. Please request a new one.']);
        exit;
    }

    // Check attempts (max 5)
    if ($otpRow['max_attempts'] >= 5) {
        $db->prepare("UPDATE otps SET status = 'failed', updated_at = NOW() WHERE id = ?")->execute([$otpId]);
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Too many attempts. Please request a new code.']);
        exit;
    }

    // Increment attempts
    $db->prepare("UPDATE otps SET max_attempts = max_attempts + 1, updated_at = NOW() WHERE id = ?")->execute([$otpId]);

    // Verify OTP code
    if ($otpRow['otp'] !== $otpCode) {
        $remaining = 4 - $otpRow['max_attempts'];
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid verification code. ' . max(0, $remaining) . ' attempts remaining.']);
        exit;
    }

    // OTP verified — update password
    $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);
    $db->prepare("UPDATE users SET password = ?, password_change_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([$hashedPassword, $userId]);
    $db->prepare("UPDATE otps SET status = 'verified', updated_at = NOW() WHERE id = ?")->execute([$otpId]);

    echo json_encode([
        'success' => true,
        'message' => 'Password reset successfully! You can now login with your new password.',
    ]);

} catch (Exception $e) {
    error_log('Reset password error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An error occurred. Please try again later.']);
}
?>

