<?php
/**
 * Extended PPPoE API that syncs to both databases
 * Writes to: 1) Your main DB (tonycommgroupltd_db) on cPanel
 *           2) FreeRADIUS DB (radius_pppoe) on VPS
 * 
 * Similar to your hotspot FreeRADIUSAPI pattern
 */

require_once __DIR__ . '/PPPoEAPI.php';

class PPPoERadiusSync extends PPPoEAPI {
    private $radiusDb;
    private $radiusConfig;
    
    /**
     * Constructor - connects to both databases
     */
    public function __construct($radiusHost = '151.243.169.144', $radiusUser = 'radius_pppoe', $radiusPassword = '2244', $radiusDbName = 'radius_pppoe') {
        // Connect to main database (cPanel)
        parent::__construct();
        
        // Store RADIUS config
        $this->radiusConfig = [
            'host' => $radiusHost,
            'user' => $radiusUser,
            'password' => $radiusPassword,
            'database' => $radiusDbName
        ];
        
        // Connect to VPS RADIUS database
        $this->connectToRadius();
    }
    
    /**
     * Connect to RADIUS database on VPS
     */
    private function connectToRadius() {
        try {
            $dsn = "mysql:host={$this->radiusConfig['host']};port=3306;dbname={$this->radiusConfig['database']};charset=utf8mb4";
            $this->radiusDb = new PDO($dsn, $this->radiusConfig['user'], $this->radiusConfig['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 5
            ]);
        } catch (PDOException $e) {
            error_log('Could not connect to RADIUS database: ' . $e->getMessage());
            throw new Exception('Could not connect to RADIUS database: ' . $e->getMessage());
        }
    }
    
    /**
     * Create or update PPPoE service in BOTH databases
     */
    public function createOrUpdateService($customerId, $mikrotikName, $mikrotikPassword, $planId = null, $routerId = null, $price = 0, $groupName = 'default') {
        // 1. Create/update in main database (cPanel)
        $serviceId = parent::createOrUpdateService($customerId, $mikrotikName, $mikrotikPassword, $planId, $routerId, $price);
        
        // 2. Sync to RADIUS database (VPS)
        $this->syncToRadius($mikrotikName, $mikrotikPassword, $groupName, $serviceId, $customerId);
        
        return $serviceId;
    }
    
    /**
     * Sync service to RADIUS database
     * Creates entries in radcheck and radusergroup tables
     */
    private function syncToRadius($username, $password, $groupName, $serviceId, $customerId) {
        try {
            $this->radiusDb->beginTransaction();
            
            // Delete existing entries
            $this->radiusDb->prepare("DELETE FROM radcheck WHERE username = ?")->execute([$username]);
            $this->radiusDb->prepare("DELETE FROM radusergroup WHERE username = ?")->execute([$username]);
            $this->radiusDb->prepare("DELETE FROM pppoe_service_mapping WHERE radius_username = ?")->execute([$username]);
            
            // Add password to radcheck (authentication)
            $stmt = $this->radiusDb->prepare("
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES (?, 'Cleartext-Password', ':=', ?)
            ");
            $stmt->execute([$username, $password]);
            
            // Add to group (for rate limits)
            $stmt = $this->radiusDb->prepare("
                INSERT INTO radusergroup (username, groupname, priority)
                VALUES (?, ?, 0)
            ");
            $stmt->execute([$username, $groupName]);
            
            // Add mapping (links RADIUS username to your main database)
            $stmt = $this->radiusDb->prepare("
                INSERT INTO pppoe_service_mapping (radius_username, main_db_service_id, main_db_customer_id)
                VALUES (?, ?, ?)
            ");
            $stmt->execute([$username, $serviceId, $customerId]);
            
            $this->radiusDb->commit();
            error_log("Successfully synced PPPoE service to RADIUS: $username");
            return true;
            
        } catch (Exception $e) {
            if ($this->radiusDb->inTransaction()) {
                $this->radiusDb->rollBack();
            }
            error_log('Failed to sync to RADIUS: ' . $e->getMessage());
            throw new Exception('Failed to sync to RADIUS: ' . $e->getMessage());
        }
    }
    
    /**
     * Delete service from both databases
     */
    public function deleteService($serviceId) {
        // Get username first
        $stmt = $this->getConnection()->prepare("SELECT mikrotik_name FROM services WHERE id = ?");
        $stmt->execute([$serviceId]);
        $service = $stmt->fetch();
        
        if ($service) {
            try {
                // Delete from RADIUS database
                $this->radiusDb->prepare("DELETE FROM radcheck WHERE username = ?")->execute([$service['mikrotik_name']]);
                $this->radiusDb->prepare("DELETE FROM radusergroup WHERE username = ?")->execute([$service['mikrotik_name']]);
                $this->radiusDb->prepare("DELETE FROM pppoe_service_mapping WHERE radius_username = ?")->execute([$service['mikrotik_name']]);
                
                // Close any active sessions in radacct
                $this->radiusDb->prepare("UPDATE radacct SET acctstoptime = NOW() WHERE username = ? AND acctstoptime IS NULL")->execute([$service['mikrotik_name']]);
                
                error_log("Deleted PPPoE service from RADIUS: {$service['mikrotik_name']}");
            } catch (Exception $e) {
                error_log('Failed to delete from RADIUS: ' . $e->getMessage());
            }
        }
        
        // Delete from main database
        return parent::deleteService($serviceId);
    }
    
    /**
     * Suspend service (removes from RADIUS to prevent login)
     */
    public function suspendService($serviceId) {
        // Get username
        $stmt = $this->getConnection()->prepare("SELECT mikrotik_name FROM services WHERE id = ?");
        $stmt->execute([$serviceId]);
        $service = $stmt->fetch();
        
        if ($service) {
            try {
                // Remove from RADIUS (prevent login)
                $this->radiusDb->prepare("DELETE FROM radcheck WHERE username = ?")->execute([$service['mikrotik_name']]);
                
                // Disconnect active sessions
                $this->radiusDb->prepare("UPDATE radacct SET acctstoptime = NOW() WHERE username = ? AND acctstoptime IS NULL")->execute([$service['mikrotik_name']]);
                
                error_log("Suspended PPPoE service in RADIUS: {$service['mikrotik_name']}");
            } catch (Exception $e) {
                error_log('Failed to suspend in RADIUS: ' . $e->getMessage());
            }
        }
        
        // Suspend in main database
        return parent::suspendService($serviceId);
    }
    
    /**
     * Activate service (adds back to RADIUS)
     */
    public function activateService($serviceId) {
        // Get service details
        $stmt = $this->getConnection()->prepare("
            SELECT s.mikrotik_name, s.mikrotik_password, s.customer_id, p.rate_limit
            FROM services s
            LEFT JOIN plans p ON s.plan_id = p.id
            WHERE s.id = ?
        ");
        $stmt->execute([$serviceId]);
        $service = $stmt->fetch();
        
        if ($service) {
            try {
                // Re-add to RADIUS
                $stmt = $this->radiusDb->prepare("
                    INSERT INTO radcheck (username, attribute, op, value)
                    VALUES (?, 'Cleartext-Password', ':=', ?)
                    ON DUPLICATE KEY UPDATE value = VALUES(value)
                ");
                $stmt->execute([$service['mikrotik_name'], $service['mikrotik_password']]);
                
                error_log("Activated PPPoE service in RADIUS: {$service['mikrotik_name']}");
            } catch (Exception $e) {
                error_log('Failed to activate in RADIUS: ' . $e->getMessage());
            }
        }
        
        // Activate in main database
        return parent::activateService($serviceId);
    }
    
    /**
     * Create or update rate limit group in RADIUS
     * Similar to your hotspot's createOrUpdateGroup method
     */
    public function createRateLimitGroup($groupName, $uploadSpeed, $downloadSpeed, $sessionTimeout = 0) {
        try {
            $this->radiusDb->beginTransaction();
            
            // Delete existing group
            $this->radiusDb->prepare("DELETE FROM radgroupreply WHERE groupname = ?")->execute([$groupName]);
            
            // Add rate limits (WISPr format - standard RADIUS)
            if (!empty($uploadSpeed) && !empty($downloadSpeed)) {
                // Convert Mbps to bytes/second
                // Example: "5M" = 5 Mbps = 5,000,000 bits/sec = 625,000 bytes/sec
                $uploadMbps = (int)str_replace(['M', 'm', 'mbps', 'Mbps'], '', $uploadSpeed);
                $downloadMbps = (int)str_replace(['M', 'm', 'mbps', 'Mbps'], '', $downloadSpeed);
                
                $uploadBytes = $uploadMbps * 125000; // Mbps to bytes/sec
                $downloadBytes = $downloadMbps * 125000;
                
                // Upload limit
                $stmt = $this->radiusDb->prepare("
                    INSERT INTO radgroupreply (groupname, attribute, op, value)
                    VALUES (?, 'WISPr-Bandwidth-Max-Up', ':=', ?)
                ");
                $stmt->execute([$groupName, $uploadBytes]);
                
                // Download limit
                $stmt = $this->radiusDb->prepare("
                    INSERT INTO radgroupreply (groupname, attribute, op, value)
                    VALUES (?, 'WISPr-Bandwidth-Max-Down', ':=', ?)
                ");
                $stmt->execute([$groupName, $downloadBytes]);
            }
            
            // Add session timeout if provided
            if ($sessionTimeout > 0) {
                $stmt = $this->radiusDb->prepare("
                    INSERT INTO radgroupreply (groupname, attribute, op, value)
                    VALUES (?, 'Session-Timeout', ':=', ?)
                ");
                $stmt->execute([$groupName, $sessionTimeout]);
            }
            
            $this->radiusDb->commit();
            error_log("Created RADIUS group: $groupName (Up: $uploadSpeed, Down: $downloadSpeed)");
            return true;
            
        } catch (Exception $e) {
            if ($this->radiusDb->inTransaction()) {
                $this->radiusDb->rollBack();
            }
            error_log('Failed to create group: ' . $e->getMessage());
            throw new Exception('Failed to create group: ' . $e->getMessage());
        }
    }
    
    /**
     * Get active sessions from RADIUS
     */
    public function getActiveRadiusSessions($nasIp = null) {
        $sql = "
            SELECT 
                r.radacctid,
                r.username,
                r.nasipaddress,
                r.framedipaddress,
                r.callingstationid as mac_address,
                r.acctstarttime,
                r.acctsessiontime,
                r.acctinputoctets as download_bytes,
                r.acctoutputoctets as upload_bytes,
                m.main_db_customer_id,
                m.main_db_service_id
            FROM radacct r
            LEFT JOIN pppoe_service_mapping m ON r.username = m.radius_username
            WHERE r.acctstoptime IS NULL
        ";
        
        $params = [];
        if ($nasIp) {
            $sql .= " AND r.nasipaddress = ?";
            $params[] = $nasIp;
        }
        
        $sql .= " ORDER BY r.acctstarttime DESC";
        
        $stmt = $this->radiusDb->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
    
    /**
     * Disconnect user session
     */
    public function disconnectRadiusSession($username) {
        $stmt = $this->radiusDb->prepare("
            UPDATE radacct 
            SET acctstoptime = NOW() 
            WHERE username = ? AND acctstoptime IS NULL
        ");
        $stmt->execute([$username]);
        return $stmt->rowCount() > 0;
    }
    
    /**
     * Test RADIUS database connection
     */
    public function testRadiusConnection() {
        try {
            $stmt = $this->radiusDb->query("SELECT 1 as test");
            return $stmt->fetch()['test'] === 1;
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Get RADIUS database connection (for direct queries if needed)
     */
    public function getRadiusConnection() {
        return $this->radiusDb;
    }
}

