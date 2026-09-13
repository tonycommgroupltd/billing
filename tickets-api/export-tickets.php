<?php
/**
 * Export Tickets to Excel (CSV) format
 * Extracts tickets from February 1st, 2026 onwards
 */

// Allow direct browser access
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="tickets_from_feb_2026.csv"');
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/helpers.php';

try {
    $db = getDB();
    
    // Query tickets from February 1st, 2026 onwards
    $sql = "SELECT 
                t.id,
                t.number AS ticket_number,
                t.subject,
                t.description,
                t.customer_name,
                t.customer_email,
                t.customer_phone,
                t.address,
                t.type,
                t.priority,
                t.status,
                t.`group`,
                t.assigned_to,
                t.created_by,
                t.created_at,
                t.updated_at
            FROM tickets t
            WHERE t.created_at >= '2026-02-01 00:00:00'
              AND t.deleted_at IS NULL
            ORDER BY t.created_at DESC";
    
    $stmt = $db->prepare($sql);
    $stmt->execute();
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Open output stream
    $output = fopen('php://output', 'w');
    
    // Add BOM for Excel UTF-8 compatibility
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
    
    // Write CSV header row
    fputcsv($output, [
        'ID',
        'Ticket Number',
        'Subject',
        'Description',
        'Customer Name',
        'Customer Email',
        'Customer Phone',
        'Address',
        'Type',
        'Priority',
        'Status',
        'Group',
        'Assigned To',
        'Created By',
        'Created At',
        'Updated At'
    ]);
    
    // Write ticket rows
    foreach ($tickets as $ticket) {
        // Clean description (remove HTML tags, trim whitespace)
        $ticket['description'] = strip_tags($ticket['description'] ?? '');
        $ticket['description'] = preg_replace('/\s+/', ' ', trim($ticket['description']));
        
        fputcsv($output, [
            $ticket['id'],
            $ticket['ticket_number'],
            $ticket['subject'],
            $ticket['description'],
            $ticket['customer_name'],
            $ticket['customer_email'],
            $ticket['customer_phone'],
            $ticket['address'],
            $ticket['type'],
            $ticket['priority'],
            $ticket['status'],
            $ticket['group'],
            $ticket['assigned_to'],
            $ticket['created_by'],
            $ticket['created_at'],
            $ticket['updated_at']
        ]);
    }
    
    fclose($output);
    
} catch (Exception $e) {
    // If error, output as plain text
    header('Content-Type: text/plain');
    header_remove('Content-Disposition');
    echo "Error exporting tickets: " . $e->getMessage();
}
