<?php
/**
 * PPPoE API Class
 * Manages PPPoE services in tonycommgroupltd_db
 * Similar to FreeRADIUSAPI but for PPPoE services
 */

require_once __DIR__ . '/../config.php';

class PPPoEAPI {
    private $db;
    
    public function __construct() {
        $config = require __DIR__ . '/../config.php';
        $dbConfig = $config['db'];
        
        try {
            $dsn = "mysql:host={$dbConfig['host']};port=" . ($dbConfig['port'] ?? 3306) . ";dbname={$dbConfig['database']};charset={$dbConfig['charset']}";
            $this->db = new PDO($dsn, $dbConfig['username'], $dbConfig['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
        } catch (PDOException $e) {
            throw new Exception('Could not connect to database: ' . $e->getMessage());
        }
    }
    
    /**
     * Create or update PPPoE service
     * This creates/updates a service in your services table
     */
    public function createOrUpdateService($customerId, $mikrotikName, $mikrotikPassword, $planId = null, $routerId = null, $price = 0) {
        try {
            $this->db->beginTransaction();
            
            // Check if service exists
            $stmt = $this->db->prepare("SELECT id FROM services WHERE mikrotik_name = ? AND deleted_at IS NULL");
            $stmt->execute([$mikrotikName]);
            $existing = $stmt->fetch();
            
            if ($existing) {
                // Update existing service
                $stmt = $this->db->prepare("
                    UPDATE services 
                    SET mikrotik_password = ?, 
                        plan_id = ?,
                        router_id = ?,
                        price = ?,
                        updated_at = NOW()
                    WHERE id = ?
                ");
                $stmt->execute([$mikrotikPassword, $planId, $routerId, $price, $existing['id']]);
                $serviceId = $existing['id'];
            } else {
                // Create new service
                $status = json_encode(['value' => 2]); // 2 = active
                
                $stmt = $this->db->prepare("
                    INSERT INTO services (
                        customer_id, mikrotik_name, mikrotik_password, 
                        plan_id, router_id, price, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ");
                $stmt->execute([$customerId, $mikrotikName, $mikrotikPassword, $planId, $routerId, $price, $status]);
                $serviceId = $this->db->lastInsertId();
            }
            
            $this->db->commit();
            return $serviceId;
            
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw new Exception('Failed to create/update PPPoE service: ' . $e->getMessage());
        }
    }
    
    /**
     * Activate service (set status to active)
     */
    public function activateService($serviceId) {
        $status = json_encode(['value' => 2]); // 2 = active
        $stmt = $this->db->prepare("UPDATE services SET status = ? WHERE id = ?");
        $stmt->execute([$status, $serviceId]);
        return true;
    }
    
    /**
     * Suspend service (set status to suspended)
     */
    public function suspendService($serviceId) {
        $status = json_encode(['value' => 1]); // 1 = suspended
        $stmt = $this->db->prepare("UPDATE services SET status = ? WHERE id = ?");
        $stmt->execute([$status, $serviceId]);
        return true;
    }
    
    /**
     * Delete service (soft delete)
     */
    public function deleteService($serviceId) {
        $stmt = $this->db->prepare("UPDATE services SET deleted_at = NOW() WHERE id = ?");
        $stmt->execute([$serviceId]);
        return true;
    }
    
    /**
     * Get service by username (mikrotik_name)
     */
    public function getServiceByUsername($username) {
        $stmt = $this->db->prepare("
            SELECT s.*, p.rate_limit, c.status as customer_status, c.name as customer_name
            FROM services s
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE s.mikrotik_name = ? AND s.deleted_at IS NULL
            LIMIT 1
        ");
        $stmt->execute([$username]);
        return $stmt->fetch();
    }
    
    /**
     * Get active PPPoE sessions
     */
    public function getActiveSessions($routerId = null) {
        $sql = "
            SELECT ps.*, s.mikrotik_name, c.name as customer_name
            FROM pppoe_sessions ps
            LEFT JOIN services s ON ps.username = s.mikrotik_name
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE ps.end_time IS NULL
        ";
        
        $params = [];
        if ($routerId !== null) {
            $sql .= " AND ps.router_id = ?";
            $params[] = $routerId;
        }
        
        $sql .= " ORDER BY ps.start_time DESC";
        
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
    
    /**
     * Get session statistics
     */
    public function getSessionStatistics($sessionId) {
        $stmt = $this->db->prepare("
            SELECT 
                SUM(in_bytes) as total_in_bytes,
                SUM(out_bytes) as total_out_bytes,
                COUNT(*) as record_count
            FROM statistics
            WHERE session_id = ?
        ");
        $stmt->execute([$sessionId]);
        return $stmt->fetch();
    }
    
    /**
     * Disconnect active session (close it)
     */
    public function disconnectSession($username, $ipAddress) {
        $stmt = $this->db->prepare("
            UPDATE pppoe_sessions 
            SET end_time = NOW() 
            WHERE username = ? AND ip_address = ? AND end_time IS NULL
        ");
        $stmt->execute([$username, $ipAddress]);
        return $stmt->rowCount() > 0;
    }
    
    /**
     * Test connection
     */
    public function testConnection() {
        try {
            $stmt = $this->db->query("SELECT 1 as test");
            return $stmt->fetch()['test'] === 1;
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Get database connection
     */
    public function getConnection() {
        return $this->db;
    }
}

