<?php

use App\Http\Controllers\AdministrationHubController;
use App\Http\Controllers\AdministratorController;
use App\Http\Controllers\AiDiagnosticController;
use App\Http\Controllers\Api\v1\Portal\AuthController as PortalAuthController;
use App\Http\Controllers\Api\v1\Portal\OtpController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\CustomerDocumentController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeletionRequestController;
use App\Http\Controllers\EmergencyBypassController;
use App\Http\Controllers\FinanceDashboardController;
use App\Http\Controllers\HotspotController;
use App\Http\Controllers\HubSyncController;
use App\Http\Controllers\IctDailyReportController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\Ipv4NetworkController;
use App\Http\Controllers\MessageDetailController;
use App\Http\Controllers\MegaPayController;
use App\Http\Controllers\MpesaController;
use App\Http\Controllers\MpesaTransactionController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PlanController;
use App\Http\Controllers\RadiusAccountingController;
use App\Http\Controllers\RadiusController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\RouterController;
use App\Http\Controllers\ServerLogsController;
use App\Http\Controllers\ServiceController;
use App\Http\Controllers\SmartOltController;
use App\Http\Controllers\SmsController;
use App\Http\Controllers\StandbyStatusController;
use App\Http\Controllers\TicketsAuthController;
use App\Http\Controllers\WebhookController;
use App\Http\Controllers\WhatsAppController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

Route::group([
    'middleware' => 'api',
    'prefix' => 'v1',
], function ($router) {

    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/refresh-token', [AuthController::class, 'refresh']);
    // Public reachability probe for HA UI — must return 2xx (never fake /login 401s).
    Route::get('/health', function () {
        return response()->json([
            'ok' => true,
            'role' => config('ha.server_role', 'unknown'),
        ]);
    });
    Route::get('/user-profile', [AuthController::class, 'userProfile']);
    Route::post('/update-profile', [AuthController::class, 'updateProfile']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    Route::post('/phone/verify', [AuthController::class, 'verifyPhone']);
    Route::get('/tickets-auth-token', [TicketsAuthController::class, 'token']);
    Route::get('/documents/verify/{token}', [CustomerDocumentController::class, 'verify'])
        ->where('token', '[A-Za-z0-9_-]+')
        ->middleware('throttle:30,1');
    Route::get('/documents/download/{token}', [CustomerDocumentController::class, 'publicDownload'])
        ->where('token', '[A-Za-z0-9_-]+')
        ->middleware('throttle:20,1');

    Route::middleware(['auth:api'])->group(function () {
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::patch('/notifications/{id}/read', [NotificationController::class, 'markRead']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    });

    Route::middleware([
        'auth:api',
        'role:super-administrator|ict|administrator|manager|customer-care',
        'throttle:20,1',
    ])->post('/ai-diagnostics/ask', [AiDiagnosticController::class, 'ask']);

    Route::middleware([
        'auth:api',
        'role:super-administrator|ict|administrator|manager',
    ])->prefix('hotspot')->group(function () {
        Route::get('/dashboard', [HotspotController::class, 'dashboard']);
        Route::get('/routers', [HotspotController::class, 'routers']);
        Route::get('/users', [HotspotController::class, 'users']);
        Route::patch('/users/status', [HotspotController::class, 'setUserStatus']);
        Route::get('/sessions', [HotspotController::class, 'sessions']);
        Route::post('/sessions/disconnect', [HotspotController::class, 'disconnectSession']);
        Route::get('/site-earnings', [HotspotController::class, 'siteEarnings']);
        Route::get('/auth-locations', [HotspotController::class, 'authLocations']);
        Route::get('/live-auth', [HotspotController::class, 'liveAuth']);
        Route::get('/logs', [HotspotController::class, 'logs']);
        Route::get('/logs/tail', [HotspotController::class, 'logTail']);
    });

    Route::get('/server-logs/catalog', [ServerLogsController::class, 'catalog']);
    Route::get('/server-logs/tail', [ServerLogsController::class, 'tail']);
    Route::get('/server-logs/report', [ServerLogsController::class, 'reportFile']);
    Route::get('/standby-status', [StandbyStatusController::class, 'show']);

    Route::middleware(['auth:api', 'role:super-administrator|ict|administrator|manager'])->group(function () {
        Route::get('/hub-sync/status', [HubSyncController::class, 'status']);
        Route::get('/hub-sync/log', [HubSyncController::class, 'logTail']);
    });

    Route::middleware(['role:super-administrator|ict|administrator'])->group(function () {
        Route::post('/add-router', [RouterController::class, 'store']);
        Route::post('/update-router/{id}', [RouterController::class, 'update']);
        Route::get('/list-routers', [RouterController::class, 'ajax']);
        Route::get('/view-router/{id}', [RouterController::class, 'show']);
        Route::get('/router-monitor-traffic/{id}', [RouterController::class, 'routerMonitor']);
        Route::get('/routers/bandwidth', [RouterController::class, 'bandwidthOverview']);
        Route::get('/routers/{id}/bandwidth/history', [RouterController::class, 'bandwidthHistory']);
        Route::delete('/routers/{id}', [RouterController::class, 'destroy']);
        Route::get('/view-update-ping', [RouterController::class, 'viewUpdatePing']);
        Route::get('/router-resource-print', [RouterController::class, 'routerStatus']);
        Route::get('/api-status/{id}', [RouterController::class, 'apiStatus']);
        Route::get('/profile_print', [RouterController::class, 'printProfile']);
        Route::get('/interface_remove', [RouterController::class, 'removeInterface']);
        Route::get('/secret_user_add', [RouterController::class, 'addUserSecret']);
        Route::get('/secret_user_remove', [RouterController::class, 'removeUserSecret']);
        Route::get('/secret_print', [RouterController::class, 'reconcile']);
        Route::get('/secret_disable', [RouterController::class, 'disableUserSecret']);
        Route::get('/secret_enable', [RouterController::class, 'enableUserSecret']);
        Route::get('/secret_user_edit', [RouterController::class, 'editUserSecret']);
        Route::get('/get-routers', [RouterController::class, 'allRouters']);
        Route::get('/get-profiles/{id}', [RouterController::class, 'allProfiles']);
        Route::get('/recon-secrets/{router_id}', [RouterController::class, 'reconSecrets']);

        Route::middleware(['auth:api'])->group(function () {
            Route::get('/emergency-bypass/status', [EmergencyBypassController::class, 'status']);
            Route::get('/emergency-bypass/sync-progress', [EmergencyBypassController::class, 'syncProgress']);
            Route::post('/emergency-bypass/mode', [EmergencyBypassController::class, 'setMode']);
            Route::post('/emergency-bypass/sync', [EmergencyBypassController::class, 'sync']);
        });

        Route::get('/ipv4-networks', [Ipv4NetworkController::class, 'index']);
        Route::post('/ipv4-networks', [Ipv4NetworkController::class, 'store']);
        Route::put('/ipv4-networks/{id}', [Ipv4NetworkController::class, 'update']);
        Route::delete('/ipv4-networks/{id}', [Ipv4NetworkController::class, 'destroy']);
        Route::get('/ipv4-scan', [Ipv4NetworkController::class, 'scan']);
        Route::get('/ipv4-scan/{id}', [Ipv4NetworkController::class, 'showScan']);
        Route::get('/ipv4-summary', [Ipv4NetworkController::class, 'summary']);
        Route::get('/ipv4-router-options', [Ipv4NetworkController::class, 'routerOptions']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager'])->group(function () {
        Route::get('/list-mpesa', [MpesaController::class, 'ajax']);
        Route::delete('/mpesa/{id}', [MpesaController::class, 'destroy']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager'])->group(function () {
        Route::get('/list-payments', [PaymentController::class, 'ajax']);
        Route::get('/list-customer-payments/{id}', [PaymentController::class, 'ajaxPayments']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager'])->group(function () {
        Route::delete('/payments/{id}', [PaymentController::class, 'destroy']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager|customer-care'])->group(function () {
        Route::post('/add-payment', [PaymentController::class, 'add']);

        Route::get('/list-invoices', [InvoiceController::class, 'ajax']);
        Route::get('/list-customer-invoices-2/{id}', [InvoiceController::class, 'ajaxInvoices']);
        Route::get('/charge', [InvoiceController::class, 'charge']);
        Route::get('/view-invoices/{id}', [InvoiceController::class, 'show']);
        Route::get('/download-invoices/{id}', [InvoiceController::class, 'downloadPdf']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager'])->group(function () {
        Route::delete('/invoices/{id}', [InvoiceController::class, 'destroy']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager|customer-care'])->group(function () {
        Route::post('/add-customers', [CustomerController::class, 'store']);
        Route::get('/list-customers', [CustomerController::class, 'ajax']);
        Route::get('/list-online-customers', [CustomerController::class, 'ajaxOnline']);
        Route::get('/list-customer-invoices/{id}', [CustomerController::class, 'ajaxInvoices']);
        Route::get('/customers/{customer}/documents', [CustomerDocumentController::class, 'index']);
        Route::get('/customers/{customer}/statement', [CustomerDocumentController::class, 'statement']);
        Route::get('/customers/{customer}/statement/pdf', [CustomerDocumentController::class, 'statementPdf']);
        Route::get('/customers/{customer}/sales-invoice/pdf', [CustomerDocumentController::class, 'mergedSalesInvoice']);
        Route::get('/customers/{customer}/invoices/{invoice}/sales-invoice', [CustomerDocumentController::class, 'salesInvoice']);
        Route::get('/customers/{customer}/invoices/{invoice}/receipt', [CustomerDocumentController::class, 'receipt']);
        Route::post('/customers/{customer}/documents/share', [CustomerDocumentController::class, 'share']);
        Route::get('/customers/{id}/list-services', [CustomerController::class, 'ajaxServices']);
        Route::get('/customers/{id}/pppoe-bandwidth/live', [CustomerController::class, 'pppoeBandwidthLive']);
        Route::get('/customers/{id}/pppoe-bandwidth/history', [CustomerController::class, 'pppoeBandwidthHistory']);
        Route::put('/customers/{id}/edit-service', [CustomerController::class, 'editService']);
        Route::get('/customers/{id}/list-plans', [CustomerController::class, 'ajaxPlans']);
        Route::post('/customers/{id}/create-service', [CustomerController::class, 'createService']);
        Route::get('/customers/{id}/list-router-plans', [CustomerController::class, 'allRouterPlans']);
        Route::get('/customers/{id}', [CustomerController::class, 'show']);
        Route::get('/view-customer/{id}', [CustomerController::class, 'show']);
        Route::post('/update-customer/{id}', [CustomerController::class, 'update']);
        Route::put('/customers/{id}', [CustomerController::class, 'update']);
        Route::post('/reset-customer-password', [CustomerController::class, 'resetCustomerPassword']);
        Route::put('/customers/{id}/reset-password', [CustomerController::class, 'resetPassword']);
        Route::post('/customers/{id}/send-welcome-message', [CustomerController::class, 'sendWelcomeMessage']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager'])->group(function () {
        Route::delete('/customers/{id}', [CustomerController::class, 'destroy']);
    });

    Route::middleware(['role:super-administrator|ict|administrator'])->group(function () {
        Route::post('/add-credits/{id}', [CustomerController::class, 'addCredit']);
    });

    Route::group(['middleware' => ['role:super-administrator|ict|administrator|financial-manager|manager|customer-care|technician|engineer|customer-creator']], function () {
        Route::get('/dashboard-stats', [DashboardController::class, 'allstats']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager|customer-care'])->group(function () {
        Route::get('/cust-dashboard-stats/{id}', [DashboardController::class, 'custstats']);
    });

    Route::middleware(['role:super-administrator|ict|administrator'])->group(function () {
        Route::get('/list-roles', [RoleController::class, 'ajax']);
        Route::post('/add-roles', [RoleController::class, 'store']);
        Route::get('/view-roles/{id}', [RoleController::class, 'show']);
        Route::post('/update-roles/{id}', [RoleController::class, 'update']);
    });

    Route::middleware(['role:super-administrator|ict|administrator'])->group(function () {
        Route::get('/list-administrators', [AdministratorController::class, 'ajax']);
        Route::post('/add-administrators', [AdministratorController::class, 'store']);
        Route::get('/view-administrators/{id}', [AdministratorController::class, 'show']);
        Route::post('/update-administrators/{id}', [AdministratorController::class, 'update']);
        Route::delete('/administrators/{id}', [AdministratorController::class, 'destroy']);

        Route::prefix('admin-hub')->group(function () {
            Route::get('/partners', [AdministrationHubController::class, 'partners']);
            Route::post('/partners', [AdministrationHubController::class, 'storePartner']);
            Route::put('/partners/{id}', [AdministrationHubController::class, 'updatePartner']);
            Route::delete('/partners/{id}', [AdministrationHubController::class, 'destroyPartner']);

            Route::get('/locations', [AdministrationHubController::class, 'locations']);
            Route::post('/locations', [AdministrationHubController::class, 'storeLocation']);
            Route::put('/locations/{id}', [AdministrationHubController::class, 'updateLocation']);
            Route::delete('/locations/{id}', [AdministrationHubController::class, 'destroyLocation']);

            Route::get('/api-keys', [AdministrationHubController::class, 'apiKeys']);
            Route::get('/license', [AdministrationHubController::class, 'license']);
            Route::get('/reports/{type}', [AdministrationHubController::class, 'report']);
        });
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager'])->group(function () {
        Route::get('/list-customers-by-billing-type', [CustomerController::class, 'ajaxByBillingType']);
        Route::get('/list-plans', [PlanController::class, 'ajax']);
        Route::get('/package-usage', [PlanController::class, 'packageUsage']);
        Route::get('/package-usage/{id}/customers', [PlanController::class, 'packageUsageCustomers']);
        Route::post('/add-plans', [PlanController::class, 'store']);
        Route::post('/update-plans/{id}', [PlanController::class, 'update']);
        Route::get('/view-plans/{id}', [PlanController::class, 'show']);
        Route::delete('/plans/{id}', [PlanController::class, 'destroy']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager|customer-care'])->group(function () {
        Route::get('/get-plans', [PlanController::class, 'allPlans']);
        Route::get('/get-plan-groups', [PlanController::class, 'planGroups']);
        Route::get('/get-router-plans/{id}', [PlanController::class, 'allRouterPlans']);

        Route::get('/list-services/{id}', [ServiceController::class, 'ajax']);
        Route::get('/list-customer-services', [ServiceController::class, 'ajaxServices']);
        Route::post('/add-services', [ServiceController::class, 'store']);
        Route::get('/view-services/{id}', [ServiceController::class, 'show']);
        Route::post('/update-services/{id}', [ServiceController::class, 'update']);
        Route::post('/update-bill-date/{id}', [ServiceController::class, 'updateBillDate']);
        Route::get('/fetch-services/{id}', [ServiceController::class, 'fetchServices']);
        Route::post('/generate-invoice', [ServiceController::class, 'generateServiceInvoice']);
        Route::post('/update-customer-services/{id}', [ServiceController::class, 'updateServices']);
        Route::get('/list-online-sessions/{id}', [ServiceController::class, 'onlineSessions']);
        Route::get('/list-daily-sessions/{id}', [ServiceController::class, 'dailySessions']);
        Route::get('/list-total-sessions/{id}', [ServiceController::class, 'totalSessions']);
        Route::get('/services/{id}/onu-web-access', [ServiceController::class, 'onuWebAccess']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager'])->group(function () {
        Route::delete('/services/{id}', [ServiceController::class, 'destroy']);
    });

    Route::middleware([
        'auth:api',
        'role:super-administrator|ict|administrator|manager',
    ])->prefix('smartolt')->group(function () {
        Route::get('/unconfigured-onus', [SmartOltController::class, 'unconfigured']);
        Route::get('/options', [SmartOltController::class, 'options']);
        Route::get('/search-services', [SmartOltController::class, 'searchServices']);
        Route::post('/authorize-onu', [SmartOltController::class, 'authorizeOnu']);
        Route::post('/retry-pppoe', [SmartOltController::class, 'retryPppoe']);
        Route::post('/change-pppoe-password', [SmartOltController::class, 'changePppoePassword']);
        Route::get('/wifi-overview', [SmartOltController::class, 'wifiOverview']);
        Route::get('/connected-devices', [SmartOltController::class, 'connectedDevices']);
        Route::post('/change-wifi-password', [SmartOltController::class, 'changeWifiPassword']);
        Route::post('/sync-onus', [SmartOltController::class, 'sync']);
    });

    Route::middleware(['role:customer|reseller'])->group(function () {
        Route::get('/cust-online-sessions', [ServiceController::class, 'onlineCustSessions']);
        Route::get('/cust-daily-sessions', [ServiceController::class, 'dailyCustSessions']);
        Route::get('/cust-total-sessions', [ServiceController::class, 'totalCustSessions']);
    });

    Route::post('/fdnds63484n/validation', [MpesaController::class, 'validation'])->withoutMiddleware('throttle');
    Route::post('/fdnds63484n/confirmation', [MpesaController::class, 'confirmation'])->withoutMiddleware('throttle');

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager|customer-care'])->group(function () {
        Route::get('search_number', [MpesaController::class, 'searchNumber']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager'])->group(function () {
        Route::get('/finance-dashboard-stats', [FinanceDashboardController::class, 'allstats']);
    });

    Route::post('/delivery-reports', [SmsController::class, 'deliveryReports'])->name('delivery.reports');

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager|customer-care'])->group(function () {
        Route::post('/send-welcome-message', [SmsController::class, 'sendWelcomeMessage']);

        Route::get('/list-messages', [MessageDetailController::class, 'ajax']);
        Route::get('/view-messages/{id}', [MessageDetailController::class, 'show']);
        Route::delete('/messages/{id}', [MessageDetailController::class, 'destroy']);
        Route::get('/sms-report', [SmsController::class, 'report']);
        Route::post('/sms/send-single', [SmsController::class, 'sendSingle']);
        Route::post('/sms/send-group', [SmsController::class, 'sendGroup']);
        Route::post('/sms/send-bulk', [SmsController::class, 'sendBulk']);
        Route::post('/sms/queue-bulk', [SmsController::class, 'queueBulkSMS']);

        Route::get('list-outbox-whatsapp', [WhatsAppController::class, 'ajaxOutbox']);
        Route::get('list-inbox-whatsapp', [WhatsAppController::class, 'ajaxInbox']);
        Route::get('/view-whatsapp/{id}', [WhatsAppController::class, 'show']);
        Route::delete('/whatsapp/{id}', [WhatsAppController::class, 'destroy']);
        Route::get('/whatsapp-templates', [WhatsAppController::class, 'listTemplates']);
        Route::get('/whatsapp-report', [WhatsAppController::class, 'report']);
        Route::post('/whatsapp/send-single', [WhatsAppController::class, 'sendSingle']);
        Route::post('/whatsapp/send-group', [WhatsAppController::class, 'sendGroup']);
        Route::post('/whatsapp/send-bulk', [WhatsAppController::class, 'sendBulk']);

        Route::post('/resend-sms/{id}', [SmsController::class, 'resendSMS']);
    });

    Route::post('/webhook/message-status', [WebhookController::class, 'handleMessageStatus']);

    Route::get('/radius/user/{username}', [RadiusController::class, 'authorizeUser'])->withoutMiddleware('throttle:api');

    Route::post('/radius/accounting', [RadiusAccountingController::class, 'handle'])->withoutMiddleware('throttle:api');

    Route::group([
        'prefix' => 'portal',
    ], function () {
        Route::post('/request-otp', [OtpController::class, 'requestOtp']);
        Route::post('/verify-otp', [OtpController::class, 'verifyOtp']);
        Route::post('/register', [PortalAuthController::class, 'register']);
        Route::middleware('auth:customer_api')->get('/me', function (Request $request) {
            return response()->json([
                'success' => true,
                'user' => $request->user(),
            ]);
        });
    });

    Route::middleware(['auth:api', 'role:super-administrator|ict|administrator|manager'])->group(function () {
        Route::get('/ict/daily-reports', [IctDailyReportController::class, 'index']);
        Route::get('/ict/daily-reports/{date}', [IctDailyReportController::class, 'show']);
        Route::post('/ict/daily-reports/{date}', [IctDailyReportController::class, 'save']);
        Route::post('/ict/daily-reports/{date}/submit', [IctDailyReportController::class, 'submit']);
        Route::post('/ict/daily-reports/{date}/reopen', [IctDailyReportController::class, 'reopen']);
    });

    Route::middleware(['auth:api', 'role:super-administrator'])->group(function () {
        Route::get('/deletion-requests', [DeletionRequestController::class, 'index']);
        Route::post('/deletion-requests/{id}/approve', [DeletionRequestController::class, 'approve']);
        Route::post('/deletion-requests/{id}/reject', [DeletionRequestController::class, 'reject']);
    });

    // Any authenticated staff can see/cancel their own deletion requests
    Route::middleware(['auth:api'])->group(function () {
        Route::get('/my-deletion-requests', [DeletionRequestController::class, 'index']);
        Route::post('/deletion-requests/{id}/cancel', [DeletionRequestController::class, 'cancel']);
    });

    Route::middleware(['role:super-administrator|ict|administrator|financial-manager|manager'])->group(function () {
        Route::post('/mpesa/status', [MpesaTransactionController::class, 'checkStatus']);
        Route::get('/mpesa/status/{transId}', [MpesaTransactionController::class, 'showStatus']);
    });
    Route::post('/mpesa/status/callback', [MpesaTransactionController::class, 'callback'])->name('mpesa.status.callback');
    Route::post('/mpesa/status/timeout', [MpesaTransactionController::class, 'timeout'])->name('mpesa.status.timeout');

    // Tonycomm MegaPay (PartyB STK) — Administration hub + ticket fees (relocation etc.)
    Route::middleware(['auth:api', 'role:super-administrator|ict|administrator|manager|financial-manager'])->prefix('megapay')->group(function () {
        Route::get('/settings', [MegaPayController::class, 'settings']);
        Route::put('/settings', [MegaPayController::class, 'updateSettings']);
        Route::post('/stk', [MegaPayController::class, 'stk']);
        Route::post('/manual', [MegaPayController::class, 'manual']);
        Route::get('/relocation/stats', [MegaPayController::class, 'relocationStats']);
        Route::get('/till/stats', [MegaPayController::class, 'tillStats']);
        Route::get('/transactions', [MegaPayController::class, 'transactions']);
        Route::get('/transactions/{checkoutId}', [MegaPayController::class, 'showTransaction']);
    });
    Route::post('/megapay/callback', [MegaPayController::class, 'callback'])
        ->withoutMiddleware('throttle')
        ->name('megapay.callback');
});
