<?php
/**
 * AdvantaSMS API Helper
 * Integration with AdvantaSMS Bulk SMS Service
 * API Documentation: https://advantasms.com/bulksms-api
 */

class AdvantaSMSAPI {
    
    private $apiKey;
    private $partnerID;
    private $shortcode;
    private $apiBaseUrl;
    
    /**
     * Constructor
     */
    public function __construct() {
        // Prefer env / tickets config.local.php; fall back to legacy defaults
        $cfg = [];
        if (function_exists('loadAppConfig')) {
            try {
                $all = loadAppConfig();
                $cfg = is_array($all['advanta_sms'] ?? null) ? $all['advanta_sms'] : [];
            } catch (Throwable $e) {
                $cfg = [];
            }
        }

        $this->apiKey = getenv('ADVANTA_API_KEY') ?: getenv('SMS_API_KEY') ?: ($cfg['api_key'] ?? '');
        $this->partnerID = getenv('ADVANTA_PARTNER_ID') ?: getenv('SMS_PARTNER_ID') ?: ($cfg['partner_id'] ?? '');
        $this->shortcode = getenv('ADVANTA_SHORTCODE') ?: getenv('SMS_SHORTCODE') ?: ($cfg['shortcode'] ?? '');
        $this->apiBaseUrl = getenv('ADVANTA_API_URL') ?: ($cfg['api_base_url'] ?? 'https://quicksms.advantasms.com/api/services');
    }
    
    /**
     * Send Single SMS
     * 
     * @param string $mobile Mobile number (254XXXXXXXXX format)
     * @param string $message SMS message content
     * @param string|null $clientSmsId Optional client reference ID
     * @return array Response from API
     */
    public function sendSingleSMS($mobile, $message, $clientSmsId = null) {
        $url = $this->apiBaseUrl . '/sendsms/';
        
        $payload = [
            'apikey' => $this->apiKey,
            'partnerID' => $this->partnerID,
            'message' => $message,
            'shortcode' => $this->shortcode,
            'mobile' => $this->formatMobile($mobile)
        ];
        
        if ($clientSmsId) {
            $payload['clientsmsid'] = $clientSmsId;
        }
        
        return $this->makeRequest($url, $payload);
    }
    
    /**
     * Send Bulk SMS (up to 20 messages per request)
     * 
     * @param array $smsList Array of SMS messages with mobile, message, etc.
     * @return array Response from API
     */
    public function sendBulkSMS($smsList) {
        $url = $this->apiBaseUrl . '/sendbulk/';
        
        // Format SMS list
        $formattedList = [];
        foreach ($smsList as $index => $sms) {
            $formattedList[] = [
                'partnerID' => $this->partnerID,
                'apikey' => $this->apiKey,
                'pass_type' => 'plain',
                'clientsmsid' => $sms['clientsmsid'] ?? $index,
                'mobile' => $this->formatMobile($sms['mobile']),
                'message' => $sms['message'],
                'shortcode' => $this->shortcode
            ];
        }
        
        $payload = [
            'count' => count($formattedList),
            'smslist' => $formattedList
        ];
        
        return $this->makeRequest($url, $payload);
    }
    
    /**
     * Send Scheduled SMS
     * 
     * @param string $mobile Mobile number
     * @param string $message SMS message
     * @param string $timeToSend Schedule time (YYYY-MM-DD HH:MM or Unix timestamp)
     * @param string|null $clientSmsId Optional client reference ID
     * @return array Response from API
     */
    public function sendScheduledSMS($mobile, $message, $timeToSend, $clientSmsId = null) {
        $url = $this->apiBaseUrl . '/sendsms/';
        
        $payload = [
            'apikey' => $this->apiKey,
            'partnerID' => $this->partnerID,
            'message' => $message,
            'shortcode' => $this->shortcode,
            'mobile' => $this->formatMobile($mobile),
            'timeToSend' => $timeToSend
        ];
        
        if ($clientSmsId) {
            $payload['clientsmsid'] = $clientSmsId;
        }
        
        return $this->makeRequest($url, $payload);
    }
    
    /**
     * Get Delivery Report
     * 
     * @param string $messageID Message ID from send response
     * @return array Delivery report
     */
    public function getDeliveryReport($messageID) {
        $url = $this->apiBaseUrl . '/getdlr/';
        
        $payload = [
            'apikey' => $this->apiKey,
            'partnerID' => $this->partnerID,
            'messageID' => $messageID
        ];
        
        return $this->makeRequest($url, $payload);
    }
    
    /**
     * Get Account Balance
     * 
     * @return array Account balance information
     */
    public function getBalance() {
        $url = $this->apiBaseUrl . '/getbalance/';
        
        $payload = [
            'apikey' => $this->apiKey,
            'partnerID' => $this->partnerID
        ];
        
        return $this->makeRequest($url, $payload);
    }
    
    /**
     * Format mobile number to 254XXXXXXXXX format
     * 
     * @param string $mobile Input mobile number
     * @return string Formatted mobile number
     */
    private function formatMobile($mobile) {
        // Remove spaces and special characters
        $mobile = preg_replace('/[^0-9]/', '', $mobile);
        
        // Convert to 254XXXXXXXXX format
        if (substr($mobile, 0, 1) === '0') {
            // 07XXXXXXXX -> 254XXXXXXXXX
            return '254' . substr($mobile, 1);
        } elseif (substr($mobile, 0, 3) === '254') {
            // Already in correct format
            return $mobile;
        } elseif (substr($mobile, 0, 4) === '+254') {
            // +254XXXXXXXXX -> 254XXXXXXXXX
            return substr($mobile, 1);
        }
        
        return $mobile;
    }
    
    /**
     * Make HTTP POST request to API
     * 
     * @param string $url API endpoint URL
     * @param array $payload Request payload
     * @return array Response from API
     */
    private function makeRequest($url, $payload) {
        $ch = curl_init($url);
        
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Accept: application/json'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        // Allow disabling SSL verification only when explicitly requested (dev machines may lack CA bundle).
        $sslVerifyEnv = getenv('ADVANTASMS_SSL_VERIFY');
        $sslVerify = true;
        if ($sslVerifyEnv !== false) {
            $val = strtolower(trim((string)$sslVerifyEnv));
            if ($val === '0' || $val === 'false' || $val === 'no' || $val === 'off') {
                $sslVerify = false;
            }
        }
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $sslVerify);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        
        curl_close($ch);
        
        if ($error) {
            return [
                'success' => false,
                'error' => $error,
                'http_code' => $httpCode
            ];
        }
        
        $decoded = json_decode($response, true);
        
        return [
            'success' => $httpCode === 200,
            'http_code' => $httpCode,
            'response' => $decoded,
            'raw_response' => $response
        ];
    }
    
    /**
     * Extract per-message result rows from an Advanta API response body.
     */
    public function getResponseItems($response) {
        $body = $response['response'] ?? null;
        if (!is_array($body)) {
            return [];
        }

        foreach (['responses', 'payload', 'data', 'smslist'] as $key) {
            if (isset($body[$key]) && is_array($body[$key])) {
                return $body[$key];
            }
        }

        if (isset($body['response']) && is_array($body['response'])) {
            foreach (['responses', 'payload', 'data'] as $key) {
                if (isset($body['response'][$key]) && is_array($body['response'][$key])) {
                    return $body['response'][$key];
                }
            }
        }

        if (isset($body[0]) && is_array($body[0])) {
            return $body;
        }

        return [];
    }

    /**
     * Read Advanta per-message status code (supports both API spellings).
     */
    public function getResultCode(array $item) {
        foreach (['respose-code', 'response-code', 'response_code', 'code'] as $key) {
            if (isset($item[$key]) && $item[$key] !== '' && $item[$key] !== null) {
                return (int)$item[$key];
            }
        }
        return null;
    }

    /**
     * Whether a single Advanta per-message row indicates the SMS was accepted.
     */
    public function isResultSuccessful(array $item) {
        $code = $this->getResultCode($item);
        if ($code === 200) {
            return true;
        }
        if ($code !== null) {
            return false;
        }

        if (!empty($item['messageid']) || !empty($item['messageID'])) {
            return true;
        }

        $desc = strtolower((string)($item['response-description'] ?? $item['description'] ?? ''));
        return strpos($desc, 'success') !== false;
    }

    /**
     * Parse API response and check if at least one message was accepted.
     */
    public function isSuccessful($response) {
        if (!empty($response['error'])) {
            return false;
        }

        $items = $this->getResponseItems($response);
        if (!empty($items)) {
            foreach ($items as $item) {
                if (is_array($item) && $this->isResultSuccessful($item)) {
                    return true;
                }
            }
            return false;
        }

        $body = $response['response'] ?? [];
        if (!is_array($body)) {
            return false;
        }
        if (!empty($body['success']) && ($body['success'] === true || $body['success'] === 'true' || $body['success'] === 1)) {
            return true;
        }
        if (isset($body['code']) && (int)$body['code'] === 200) {
            return true;
        }

        return false;
    }

    /**
     * Match Advanta result rows to outbound recipients and tally sent/failed counts.
     *
     * @return array{sent:int,failed:int,errors:array,matched:array}
     */
    public function tallySendResults($response, array $batchRecipients) {
        $sent = 0;
        $failed = 0;
        $errors = [];
        $matched = [];
        $items = $this->getResponseItems($response);

        if (!empty($items)) {
            $byClientId = [];
            $byMobile = [];
            foreach ($batchRecipients as $idx => $recipient) {
                $cid = (string)($recipient['clientsmsid'] ?? '');
                if ($cid !== '') {
                    $byClientId[$cid] = $idx;
                }
                $mobileKey = preg_replace('/\D/', '', (string)($recipient['mobile'] ?? $recipient['phone_number'] ?? ''));
                if ($mobileKey !== '') {
                    $byMobile[$mobileKey] = $idx;
                }
            }

            $used = [];
            foreach ($items as $itemIndex => $item) {
                if (!is_array($item)) {
                    continue;
                }

                $idx = null;
                $clientId = (string)($item['clientsmsid'] ?? '');
                if ($clientId !== '' && isset($byClientId[$clientId])) {
                    $idx = $byClientId[$clientId];
                } else {
                    $mobileKey = preg_replace('/\D/', '', (string)($item['mobile'] ?? ''));
                    if ($mobileKey !== '' && isset($byMobile[$mobileKey])) {
                        $idx = $byMobile[$mobileKey];
                    } elseif (isset($batchRecipients[$itemIndex])) {
                        $idx = $itemIndex;
                    }
                }

                $success = $this->isResultSuccessful($item);
                $msgId = $item['messageid'] ?? $item['messageID'] ?? null;
                $desc = $item['response-description'] ?? $item['description'] ?? 'Unknown error';

                if ($idx !== null && !isset($used[$idx])) {
                    $used[$idx] = true;
                    $matched[$idx] = [
                        'success' => $success,
                        'message_id' => $msgId,
                        'api_response' => $item,
                    ];
                    if ($success) {
                        $sent++;
                    } else {
                        $failed++;
                        $mobile = $batchRecipients[$idx]['mobile'] ?? $batchRecipients[$idx]['phone_number'] ?? '';
                        $errors[] = "Failed for {$mobile}: {$desc}";
                    }
                } elseif ($idx === null) {
                    if ($success) {
                        $sent++;
                    } else {
                        $failed++;
                        $errors[] = $desc;
                    }
                }
            }

            foreach ($batchRecipients as $idx => $recipient) {
                if (isset($used[$idx])) {
                    continue;
                }
                $failed++;
                $mobile = $recipient['mobile'] ?? $recipient['phone_number'] ?? '';
                $errors[] = "No API status returned for {$mobile}";
            }

            return ['sent' => $sent, 'failed' => $failed, 'errors' => $errors, 'matched' => $matched];
        }

        if ($this->isSuccessful($response)) {
            foreach ($batchRecipients as $idx => $recipient) {
                $matched[$idx] = [
                    'success' => true,
                    'message_id' => null,
                    'api_response' => $response['response'] ?? $response,
                ];
            }
            return [
                'sent' => count($batchRecipients),
                'failed' => 0,
                'errors' => [],
                'matched' => $matched,
            ];
        }

        $err = $this->getErrorMessage($response);
        foreach ($batchRecipients as $idx => $recipient) {
            $matched[$idx] = [
                'success' => false,
                'message_id' => null,
                'api_response' => $response['response'] ?? $response,
            ];
        }
        return [
            'sent' => 0,
            'failed' => count($batchRecipients),
            'errors' => [$err],
            'matched' => $matched,
        ];
    }

    /**
     * Get error message from response
     */
    public function getErrorMessage($response) {
        if (isset($response['error'])) {
            return $response['error'];
        }

        $items = $this->getResponseItems($response);
        if (!empty($items[0])) {
            return $items[0]['response-description']
                ?? $items[0]['description']
                ?? $items[0]['message']
                ?? 'Unknown error occurred';
        }

        $body = $response['response'] ?? [];
        if (is_array($body)) {
            return $body['message'] ?? $body['error'] ?? 'Unknown error occurred';
        }

        return 'Unknown error occurred';
    }

    /**
     * Get message ID from successful response
     */
    public function getMessageId($response) {
        $items = $this->getResponseItems($response);
        if (!empty($items[0])) {
            return $items[0]['messageid'] ?? $items[0]['messageID'] ?? null;
        }
        return null;
    }
    
    /**
     * Response code meanings
     * 
     * @return array Response codes and their descriptions
     */
    public function getResponseCodes() {
        return [
            '200' => 'Successful Request Call',
            '1001' => 'Invalid sender id',
            '1002' => 'Network not allowed',
            '1003' => 'Invalid mobile number',
            '1004' => 'Low bulk credits',
            '1005' => 'Failed. System error',
            '1006' => 'Invalid credentials',
            '1007' => 'Failed. System error',
            '1008' => 'No Delivery Report',
            '1009' => 'Unsupported data type',
            '1010' => 'Unsupported request type',
            '4090' => 'Internal Error. Try again after 5 minutes',
            '4091' => 'No Partner ID is Set',
            '4092' => 'No API KEY Provided',
            '4093' => 'Details Not Found'
        ];
    }
}

// Example usage (remove or comment out in production):
/*
$sms = new AdvantaSMSAPI();

// Send single SMS
$result = $sms->sendSingleSMS('0712345678', 'Test message');
print_r($result);

// Send bulk SMS
$bulkMessages = [
    ['mobile' => '0712345678', 'message' => 'Test 1', 'clientsmsid' => '1'],
    ['mobile' => '0723456789', 'message' => 'Test 2', 'clientsmsid' => '2'],
];
$result = $sms->sendBulkSMS($bulkMessages);
print_r($result);

// Get balance
$balance = $sms->getBalance();
print_r($balance);

// Get delivery report
$dlr = $sms->getDeliveryReport('12345678');
print_r($dlr);
*/
