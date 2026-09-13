<?php
/**
 * Network Map API
 * Provides endpoints for fiber network infrastructure data
 * 
 * Endpoints:
 * GET /network-map.php?type=all          - Get all infrastructure data
 * GET /network-map.php?type=fat          - Get FAT points only
 * GET /network-map.php?type=closures     - Get closures only
 * GET /network-map.php?type=splitters    - Get splitters only
 * GET /network-map.php?type=cables       - Get cables only
 * GET /network-map.php?type=poles        - Get poles only
 * GET /network-map.php?type=customers    - Get customers with locations
 * GET /network-map.php?type=hubs         - Get hub locations
 * GET /network-map.php?type=transformers - Get transformers
 * GET /network-map.php?type=buildings    - Get buildings
 * 
 * GET /network-map.php?type=custom       - Get custom legend layers + features
 * 
 * POST /network-map.php/import           - Import QGIS data (admin only)
 * POST /network-map.php/layers           - Create/update custom layer styling
 */

require_once __DIR__ . '/helpers.php';

date_default_timezone_set('Africa/Nairobi');
setCorsHeaders();
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$request = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$action = $request[0] ?? '';

try {
    $db = getDB();
    
    switch ($method) {
        case 'GET':
            $type = $_GET['type'] ?? 'all';
            getNetworkData($db, $type);
            break;
            
        case 'POST':
            if ($action === 'import') {
                importQgisData($db);
            } elseif ($action === 'regenerate-map') {
                $qgisResult = generateQgis2webLayers($db);
                echo json_encode([
                    'success' => !empty($qgisResult['success']),
                    'mapLayers' => $qgisResult,
                    'message' => $qgisResult['message'] ?? ($qgisResult['error'] ?? 'Map regeneration finished'),
                ]);
            } elseif ($action === 'update-splitter-counts') {
                updateSplitterCounts($db);
            } elseif ($action === 'layers') {
                saveMapLayerConfig($db);
            } else {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid action']);
            }
            break;
            
        case 'PATCH':
            if ($action === 'update-splitter-counts') {
                updateSplitterCounts($db);
            } else {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid action']);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    error_log("Network Map API Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage()
    ]);
}

function getNetworkData($db, $type) {
    ensureCustomMapTables($db);
    $response = ['success' => true];
    
    // Check for lite mode (faster loading with limited data)
    $lite = isset($_GET['lite']) && $_GET['lite'] === '1';
    $limit = $lite ? 'LIMIT 200' : '';
    
    // Helper function to safely query a table
    $safeQuery = function($db, $sql) {
        try {
            $stmt = $db->query($sql);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            // Table doesn't exist yet, return empty array
            return [];
        }
    };
    
    // Get FAT points - only essential columns
    if ($type === 'all' || $type === 'fat') {
        $fatCols = networkHasLabelNumColumn($db, 'network_fat') ? ', label_num' : '';
        $response['fat'] = $safeQuery($db, "SELECT id, fid, latitude, longitude, description, hub_name, hub_distance, layer_name{$fatCols} FROM network_fat WHERE status = 'active' ORDER BY id $limit");
    }
    
    // Get Closures - only essential columns
    if ($type === 'all' || $type === 'closures') {
        $closureCols = networkHasLabelNumColumn($db, 'network_closures') ? ', label_num' : '';
        $response['closures'] = $safeQuery($db, "SELECT id, fid, latitude, longitude, description, hub_name, layer_name{$closureCols} FROM network_closures WHERE status = 'active' ORDER BY id $limit");
    }
    
    // Get Splitters - only essential columns
    if ($type === 'all' || $type === 'splitters') {
        $response['splitters'] = $safeQuery($db, "SELECT id, fid, latitude, longitude, splitter_type, description, hub_distance, layer_name FROM network_splitters WHERE status = 'active' ORDER BY splitter_type, id $limit");
    }
    
    // Get Hubs - only essential columns
    if ($type === 'all' || $type === 'hubs') {
        $response['hubs'] = $safeQuery($db, "SELECT id, fid, name, latitude, longitude, description FROM network_hubs WHERE status = 'active' ORDER BY id $limit");
    }
    
    // Get Cables - only essential columns (cables are the biggest performance hit)
    if ($type === 'all' || $type === 'cables') {
        $cableLimit = $lite ? 'LIMIT 100' : $limit; // Even more limited for cables in lite mode
        $cables = $safeQuery($db, "SELECT id, fid, cable_type, coordinates, description, length_meters, layer_name FROM network_cables WHERE status IN ('active', 'proposed') ORDER BY cable_type, id $cableLimit");
        // Decode JSON coordinates
        foreach ($cables as &$cable) {
            if (isset($cable['coordinates'])) {
                $cable['coordinates'] = json_decode($cable['coordinates'], true);
            }
        }
        $response['cables'] = $cables;
    }
    
    // Get Poles - only essential columns
    if ($type === 'all' || $type === 'poles') {
        $response['poles'] = $safeQuery($db, "SELECT id, fid, pole_type, latitude, longitude, description, layer_name FROM network_poles WHERE status = 'active' ORDER BY pole_type, id $limit");
    }
    
    // Get Transformers - only essential columns
    if ($type === 'all' || $type === 'transformers') {
        $response['transformers'] = $safeQuery($db, "SELECT id, fid, latitude, longitude, description FROM network_transformers WHERE status = 'active' ORDER BY id $limit");
    }
    
    // Get Buildings - only essential columns
    if ($type === 'all' || $type === 'buildings') {
        $response['buildings'] = $safeQuery($db, "SELECT id, fid, building_type, latitude, longitude, description, layer_name FROM network_buildings WHERE status IN ('active', 'potential') ORDER BY building_type, id $limit");
    }
    
    // Get Customers with locations - only essential columns
    if ($type === 'all' || $type === 'customers') {
        try {
            $customerLimit = $lite ? 'LIMIT 100' : '';
            $stmt = $db->query("
                SELECT 
                    c.id, c.full_name, c.phone, c.latitude, c.longitude
                FROM customers c
                WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
                ORDER BY c.full_name
                $customerLimit
            ");
            $response['customers'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            // Columns might not exist yet
            $response['customers'] = [];
        }
    }
    
    // Get misc items - only essential columns (skip in lite mode)
    if (($type === 'all' && !$lite) || $type === 'misc') {
        $response['misc'] = $safeQuery($db, "SELECT id, fid, item_type, latitude, longitude, description, layer_name FROM network_misc WHERE status = 'active' ORDER BY item_type, id $limit");
    } else if ($lite && $type === 'all') {
        $response['misc'] = []; // Empty in lite mode
    }
    
    // Custom legend layers + features (always include on full load)
    if (($type === 'all' && !$lite) || $type === 'custom') {
        $response['custom_layers'] = getCustomMapLayers($db);
        $response['custom_features'] = getCustomMapFeaturesGrouped($db);
    } else if ($lite && $type === 'all') {
        $response['custom_layers'] = [];
        $response['custom_features'] = [];
    }

    // Get statistics
    if ($type === 'all' || $type === 'stats') {
        $response['stats'] = getNetworkStats($db);
    }
    
    echo json_encode($response);
}

function ensureCustomMapTables($db) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $db->exec("
        CREATE TABLE IF NOT EXISTS network_map_layers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            layer_key VARCHAR(64) NOT NULL,
            title VARCHAR(120) NOT NULL,
            geometry_type ENUM('point', 'line') NOT NULL DEFAULT 'point',
            color VARCHAR(20) NOT NULL DEFAULT '#3388ff',
            fill_color VARCHAR(20) NULL,
            stroke_width DECIMAL(4, 2) NOT NULL DEFAULT 3.00,
            point_shape ENUM('circle', 'square', 'triangle', 'star') DEFAULT 'circle',
            point_radius DECIMAL(4, 1) NOT NULL DEFAULT 6.0,
            label_field VARCHAR(32) DEFAULT 'description',
            legend_icon VARCHAR(255) NULL,
            sort_order INT NOT NULL DEFAULT 100,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_layer_key (layer_key),
            INDEX idx_active (is_active)
        )
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS network_map_custom_features (
            id INT AUTO_INCREMENT PRIMARY KEY,
            layer_key VARCHAR(64) NOT NULL,
            fid VARCHAR(50),
            description TEXT,
            label_text VARCHAR(255),
            latitude DECIMAL(10, 8) NULL,
            longitude DECIMAL(11, 8) NULL,
            coordinates JSON NULL,
            properties JSON NULL,
            status ENUM('active', 'inactive') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_layer_key (layer_key),
            INDEX idx_status (status)
        )
    ");
    $ready = true;
}

function slugifyMapLayerKey($text) {
    $base = pathinfo((string)$text, PATHINFO_FILENAME);
    $s = strtolower(preg_replace('/[^a-z0-9]+/i', '_', $base));
    $s = trim($s, '_');
    return $s !== '' ? $s : 'custom_layer';
}

function colorFromLayerKey($layerKey) {
    return '#' . substr(md5($layerKey), 0, 6);
}

function getCustomMapLayers($db) {
    try {
        $stmt = $db->query("
            SELECT layer_key, title, geometry_type, color, fill_color, stroke_width,
                   point_shape, point_radius, label_field, legend_icon, sort_order
            FROM network_map_layers
            WHERE is_active = 1
            ORDER BY sort_order ASC, title ASC
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        return [];
    }
}

function getCustomMapFeaturesGrouped($db) {
    try {
        $stmt = $db->query("
            SELECT id, layer_key, fid, description, label_text, latitude, longitude, coordinates, properties
            FROM network_map_custom_features
            WHERE status = 'active'
            ORDER BY layer_key ASC, id ASC
        ");
        $grouped = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!empty($row['coordinates']) && is_string($row['coordinates'])) {
                $row['coordinates'] = json_decode($row['coordinates'], true);
            }
            if (!empty($row['properties']) && is_string($row['properties'])) {
                $row['properties'] = json_decode($row['properties'], true);
            }
            $grouped[$row['layer_key']][] = $row;
        }
        return $grouped;
    } catch (PDOException $e) {
        return [];
    }
}

function ensureMapLayer($db, $layerKey, $title, $geometryType = 'point', array $options = []) {
    ensureCustomMapTables($db);
    $layerKey = slugifyMapLayerKey($layerKey);
    $title = trim($title) !== '' ? trim($title) : $layerKey;
    $geometryType = $geometryType === 'line' ? 'line' : 'point';

    $stmt = $db->prepare("SELECT id FROM network_map_layers WHERE layer_key = ?");
    $stmt->execute([$layerKey]);
    if ($stmt->fetch()) {
        return $layerKey;
    }

    $color = $options['color'] ?? colorFromLayerKey($layerKey);
    $fillColor = $options['fill_color'] ?? $color;
    $shape = $options['point_shape'] ?? 'circle';
    $labelField = $options['label_field'] ?? 'description';

    $insert = $db->prepare("
        INSERT INTO network_map_layers
            (layer_key, title, geometry_type, color, fill_color, stroke_width, point_shape, point_radius, label_field, legend_icon, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $insert->execute([
        $layerKey,
        $title,
        $geometryType,
        $color,
        $fillColor,
        $options['stroke_width'] ?? ($geometryType === 'line' ? 3 : 2),
        $shape,
        $options['point_radius'] ?? 6,
        $labelField,
        $options['legend_icon'] ?? null,
        $options['sort_order'] ?? 100,
    ]);

    return $layerKey;
}

function saveMapLayerConfig($db) {
    ensureCustomMapTables($db);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $layerKey = slugifyMapLayerKey($input['layer_key'] ?? $input['layerKey'] ?? '');
    if ($layerKey === 'custom_layer' && empty($input['layer_key']) && empty($input['layerKey'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'layer_key is required']);
        return;
    }

    $title = trim($input['title'] ?? $layerKey);
    $geometryType = ($input['geometry_type'] ?? $input['geometryType'] ?? 'point') === 'line' ? 'line' : 'point';

    ensureMapLayer($db, $layerKey, $title, $geometryType, [
        'color' => $input['color'] ?? colorFromLayerKey($layerKey),
        'fill_color' => $input['fill_color'] ?? $input['fillColor'] ?? null,
        'stroke_width' => $input['stroke_width'] ?? $input['strokeWidth'] ?? null,
        'point_shape' => $input['point_shape'] ?? $input['pointShape'] ?? 'circle',
        'point_radius' => $input['point_radius'] ?? $input['pointRadius'] ?? 6,
        'label_field' => $input['label_field'] ?? $input['labelField'] ?? 'description',
        'legend_icon' => $input['legend_icon'] ?? $input['legendIcon'] ?? null,
        'sort_order' => $input['sort_order'] ?? $input['sortOrder'] ?? 100,
    ]);

    $fields = [];
    $values = [];
    $allowed = [
        'title' => 'title',
        'geometry_type' => 'geometryType',
        'color' => 'color',
        'fill_color' => 'fillColor',
        'stroke_width' => 'strokeWidth',
        'point_shape' => 'pointShape',
        'point_radius' => 'pointRadius',
        'label_field' => 'labelField',
        'legend_icon' => 'legendIcon',
        'sort_order' => 'sortOrder',
        'is_active' => 'isActive',
    ];
    foreach ($allowed as $col => $camel) {
        if (array_key_exists($col, $input)) {
            $fields[] = "$col = ?";
            $values[] = $input[$col];
        } elseif (array_key_exists($camel, $input)) {
            $fields[] = "$col = ?";
            $values[] = $input[$camel];
        }
    }
    if (!empty($fields)) {
        $values[] = $layerKey;
        $db->prepare("UPDATE network_map_layers SET " . implode(', ', $fields) . " WHERE layer_key = ?")->execute($values);
    }

    echo json_encode([
        'success' => true,
        'layer_key' => $layerKey,
        'message' => 'Layer saved',
    ]);
}

function getNetworkStats($db) {
    $stats = [
        'fat_count' => 0,
        'closure_count' => 0,
        'splitter_count' => 0,
        'cable_count' => 0,
        'pole_count' => 0,
        'hub_count' => 0,
        'customers_with_location' => 0
    ];
    
    // Helper function to safely count
    $safeCount = function($db, $sql) {
        try {
            $stmt = $db->query($sql);
            return (int)$stmt->fetch()['count'];
        } catch (PDOException $e) {
            return 0;
        }
    };
    
    $stats['fat_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_fat WHERE status = 'active'");
    $stats['closure_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_closures WHERE status = 'active'");
    $stats['splitter_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_splitters WHERE status = 'active'");
    $stats['cable_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_cables WHERE status = 'active'");
    $stats['pole_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_poles WHERE status = 'active'");
    $stats['hub_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_hubs WHERE status = 'active'");
    $stats['customers_with_location'] = $safeCount($db, "SELECT COUNT(*) as count FROM customers WHERE latitude IS NOT NULL");
    $stats['custom_layer_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_map_layers WHERE is_active = 1");
    $stats['custom_feature_count'] = $safeCount($db, "SELECT COUNT(*) as count FROM network_map_custom_features WHERE status = 'active'");

    return $stats;
}

function importQgisData($db) {
    // This endpoint imports data from QGIS GeoJSON files
    // Files should be uploaded or placed in the qgis_data folder
    
    $input = json_decode(file_get_contents('php://input'), true);
    $layer = $input['layer'] ?? null;
    $features = $input['features'] ?? [];
    $sourceFile = $input['sourceFile'] ?? '';
    $cableHint = $input['cableHint'] ?? '';
    $layerKey = slugifyMapLayerKey($input['layerKey'] ?? '');
    $layerTitle = trim($input['layerTitle'] ?? '');
    $geometryTypeHint = $input['geometryType'] ?? null;

    if ($layer === 'unknown') {
        $layer = 'custom';
    }
    
    if (!$layer || empty($features)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing layer or features']);
        return;
    }

    ensureCustomMapTables($db);

    if ($layer === 'custom') {
        if ($layerKey === 'custom_layer' && empty($input['layerKey'])) {
            $layerKey = slugifyMapLayerKey($sourceFile ?: 'custom_layer');
        }
        if ($layerTitle === '') {
            $layerTitle = pathinfo($sourceFile, PATHINFO_FILENAME) ?: $layerKey;
        }
        $detectedGeomType = 'point';
        foreach ($features as $previewFeature) {
            $previewType = $previewFeature['geometry']['type'] ?? '';
            if (in_array($previewType, ['LineString', 'MultiLineString'], true)) {
                $detectedGeomType = 'line';
                break;
            }
        }
        if ($geometryTypeHint === 'line' || $geometryTypeHint === 'point') {
            $detectedGeomType = $geometryTypeHint;
        }
        $layerKey = ensureMapLayer($db, $layerKey, $layerTitle, $detectedGeomType);
    }
    
    $imported = 0;
    $errors = [];
    
    foreach ($features as $feature) {
        try {
            $props = $feature['properties'] ?? [];
            $geometry = $feature['geometry'] ?? null;
            
            if (!$geometry) continue;
            
            $coords = $geometry['coordinates'] ?? null;
            $geomType = $geometry['type'] ?? 'Point';
            
            switch ($layer) {
                case 'fat':
                    if ($geomType === 'Point' && $coords) {
                        $labelNum = $props['num'] ?? null;
                        if (networkHasLabelNumColumn($db, 'network_fat')) {
                            $stmt = $db->prepare("
                                INSERT INTO network_fat (fid, description, latitude, longitude, hub_name, hub_distance, splitter_info, layer_name, label_num)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ");
                            $stmt->execute([
                                $props['FID'] ?? $props['fid'] ?? null,
                                $props['description'] ?? $props['Description'] ?? null,
                                $coords[1],
                                $coords[0],
                                $props['HubName'] ?? $props['hubname'] ?? null,
                                $props['HubDist'] ?? $props['hubdist'] ?? null,
                                $props['Sketches'] ?? $props['splitter'] ?? null,
                                $props['layer'] ?? 'FAT',
                                $labelNum,
                            ]);
                        } else {
                            $stmt = $db->prepare("
                                INSERT INTO network_fat (fid, description, latitude, longitude, hub_name, hub_distance, splitter_info, layer_name)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ");
                            $stmt->execute([
                                $props['FID'] ?? $props['fid'] ?? null,
                                $props['description'] ?? $props['Description'] ?? null,
                                $coords[1],
                                $coords[0],
                                $props['HubName'] ?? $props['hubname'] ?? null,
                                $props['HubDist'] ?? $props['hubdist'] ?? null,
                                $props['Sketches'] ?? $props['splitter'] ?? null,
                                $props['layer'] ?? 'FAT',
                            ]);
                        }
                        $imported++;
                    }
                    break;
                    
                case 'closure':
                    if ($geomType === 'Point' && $coords) {
                        $labelNum = $props['num'] ?? null;
                        if (networkHasLabelNumColumn($db, 'network_closures')) {
                            $stmt = $db->prepare("
                                INSERT INTO network_closures (fid, description, latitude, longitude, hub_name, hub_distance, splitter_info, layer_name, label_num)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ");
                            $stmt->execute([
                                $props['FID'] ?? $props['fid'] ?? null,
                                $props['description'] ?? $props['Description'] ?? null,
                                $coords[1],
                                $coords[0],
                                $props['HubName'] ?? $props['hubname'] ?? null,
                                $props['HubDist'] ?? $props['hubdist'] ?? null,
                                $props['Sketches'] ?? null,
                                $props['layer'] ?? 'Closure',
                                $labelNum,
                            ]);
                        } else {
                            $stmt = $db->prepare("
                                INSERT INTO network_closures (fid, description, latitude, longitude, hub_name, hub_distance, splitter_info, layer_name)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ");
                            $stmt->execute([
                                $props['FID'] ?? $props['fid'] ?? null,
                                $props['description'] ?? $props['Description'] ?? null,
                                $coords[1],
                                $coords[0],
                                $props['HubName'] ?? $props['hubname'] ?? null,
                                $props['HubDist'] ?? $props['hubdist'] ?? null,
                                $props['Sketches'] ?? null,
                                $props['layer'] ?? 'Closure',
                            ]);
                        }
                        $imported++;
                    }
                    break;
                    
                case 'splitter':
                    if ($geomType === 'Point' && $coords) {
                        $stmt = $db->prepare("
                            INSERT INTO network_splitters (fid, description, splitter_type, latitude, longitude, hub_name, hub_distance, layer_name)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $props['FID'] ?? $props['fid'] ?? null,
                            $props['description'] ?? null,
                            $props['type'] ?? $props['layer'] ?? '1:8',
                            $coords[1],
                            $coords[0],
                            $props['HubName'] ?? null,
                            $props['HubDist'] ?? null,
                            $props['layer'] ?? 'Splitter'
                        ]);
                        $imported++;
                    }
                    break;
                    
                case 'cable':
                    $lineSets = extractLineGeometriesFromGeoJson($geometry);
                    foreach ($lineSets as $lineCoords) {
                        if (count($lineCoords) < 2) {
                            continue;
                        }
                        $leafletCoords = array_map(function($c) {
                            return [(float)$c[1], (float)$c[0]];
                        }, $lineCoords);
                        $meta = inferCableMetaFromImport($props, $sourceFile, $cableHint);

                        $stmt = $db->prepare("
                            INSERT INTO network_cables (fid, description, cable_type, coordinates, hub_name, hub_distance, layer_name, is_proposed, length_meters)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $props['FID'] ?? $props['fid'] ?? null,
                            $props['description'] ?? null,
                            $meta['cable_type'],
                            json_encode($leafletCoords),
                            $props['HubName'] ?? null,
                            $props['HubDist'] ?? null,
                            $meta['layer_name'],
                            $meta['is_proposed'] ? 1 : 0,
                            computeLineLengthMeters($leafletCoords),
                        ]);
                        $imported++;
                    }
                    break;
                    
                case 'pole':
                    if ($geomType === 'Point' && $coords) {
                        $poleType = 'tcom';
                        $layerLower = strtolower($props['layer'] ?? '');
                        if (strpos($layerLower, 'kplc') !== false) {
                            $poleType = 'kplc';
                        } else if (strpos($layerLower, 'proposed') !== false) {
                            $poleType = 'proposed';
                        }
                        
                        $stmt = $db->prepare("
                            INSERT INTO network_poles (fid, description, pole_type, latitude, longitude, hub_name, hub_distance, layer_name)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $props['FID'] ?? $props['fid'] ?? null,
                            $props['description'] ?? null,
                            $poleType,
                            $coords[1],
                            $coords[0],
                            $props['HubName'] ?? null,
                            $props['HubDist'] ?? null,
                            $props['layer'] ?? 'Pole'
                        ]);
                        $imported++;
                    }
                    break;
                    
                case 'hub':
                    if ($geomType === 'Point' && $coords) {
                        $stmt = $db->prepare("
                            INSERT INTO network_hubs (fid, name, description, latitude, longitude, layer_name)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $props['FID'] ?? $props['fid'] ?? null,
                            $props['Name'] ?? $props['name'] ?? 'Hub',
                            $props['description'] ?? null,
                            $coords[1],
                            $coords[0],
                            $props['layer'] ?? 'HUB'
                        ]);
                        $imported++;
                    }
                    break;
                    
                case 'transformer':
                    if ($geomType === 'Point' && $coords) {
                        $stmt = $db->prepare("
                            INSERT INTO network_transformers (fid, description, latitude, longitude, hub_name, hub_distance, layer_name)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $props['FID'] ?? $props['fid'] ?? null,
                            $props['description'] ?? null,
                            $coords[1],
                            $coords[0],
                            $props['HubName'] ?? null,
                            $props['HubDist'] ?? null,
                            $props['layer'] ?? 'Transformer'
                        ]);
                        $imported++;
                    }
                    break;
                    
                case 'building':
                    if ($geomType === 'Point' && $coords) {
                        $stmt = $db->prepare("
                            INSERT INTO network_buildings (fid, description, building_type, latitude, longitude, hub_name, hub_distance, layer_name)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $props['FID'] ?? $props['fid'] ?? null,
                            $props['description'] ?? null,
                            $props['type'] ?? $props['layer'] ?? 'Building',
                            $coords[1],
                            $coords[0],
                            $props['HubName'] ?? null,
                            $props['HubDist'] ?? null,
                            $props['layer'] ?? 'Building'
                        ]);
                        $imported++;
                    }
                    break;

                case 'custom':
                    $description = $props['description'] ?? $props['Description'] ?? $props['name'] ?? null;
                    $labelText = $props['num'] ?? $props['label'] ?? $props['label_text'] ?? $description;

                    if ($geomType === 'Point' && $coords) {
                        $stmt = $db->prepare("
                            INSERT INTO network_map_custom_features
                                (layer_key, fid, description, label_text, latitude, longitude, properties)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $layerKey,
                            $props['FID'] ?? $props['fid'] ?? null,
                            $description,
                            $labelText,
                            $coords[1],
                            $coords[0],
                            json_encode($props),
                        ]);
                        $imported++;
                    } elseif (in_array($geomType, ['LineString', 'MultiLineString'], true)) {
                        $lineSets = extractLineGeometriesFromGeoJson($geometry);
                        foreach ($lineSets as $lineCoords) {
                            if (count($lineCoords) < 2) {
                                continue;
                            }
                            $leafletCoords = array_map(function($c) {
                                return [(float)$c[1], (float)$c[0]];
                            }, $lineCoords);
                            $stmt = $db->prepare("
                                INSERT INTO network_map_custom_features
                                    (layer_key, fid, description, label_text, coordinates, properties)
                                VALUES (?, ?, ?, ?, ?, ?)
                            ");
                            $stmt->execute([
                                $layerKey,
                                $props['FID'] ?? $props['fid'] ?? null,
                                $description,
                                $labelText,
                                json_encode($leafletCoords),
                                json_encode($props),
                            ]);
                            $imported++;
                        }
                    }
                    break;
            }
        } catch (Exception $e) {
            $errors[] = "Feature import failed: " . $e->getMessage();
        }
    }
    
    // After successful import, regenerate qgis2web files
    $qgisResult = generateQgis2webLayers($db);

    echo json_encode([
        'success' => true,
        'count' => $imported,
        'imported' => $imported,
        'layer_key' => $layer === 'custom' ? $layerKey : null,
        'message' => $qgisResult['success']
            ? "Imported $imported features and regenerated map layers"
            : "Imported $imported features but map layer regeneration failed: " . ($qgisResult['error'] ?? 'unknown error'),
        'errors' => $errors,
        'mapLayers' => $qgisResult,
        'mapUpdated' => !empty($qgisResult['success']),
    ]);
}

/**
 * Update splitter counts for a FAT or Closure
 * POST/PATCH /network-map.php/update-splitter-counts
 * Request body: {
 *   "targetType": "fat" | "closure",
 *   "id": 123,
 *   "counts": {
 *     "1_2": 0,
 *     "1_4": 1,
 *     "1_8": 3,
 *     "1_16": 0,
 *     "1_32": 0
 *   },
 *   "updatedBy": "username"
 * }
 */
function updateSplitterCounts($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    $targetType = $input['targetType'] ?? null;
    $id = $input['id'] ?? null;
    $counts = $input['counts'] ?? null;
    $updatedBy = $input['updatedBy'] ?? 'system';
    
    // Validation
    if (!in_array($targetType, ['fat', 'closure'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'targetType must be "fat" or "closure"'
        ]);
        return;
    }
    
    if (!$id || !is_numeric($id)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'id must be a valid integer'
        ]);
        return;
    }
    
    if (!is_array($counts)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'counts must be an object with splitter counts'
        ]);
        return;
    }
    
    // Validate and sanitize counts
    $validatedCounts = [];
    $allowedKeys = ['1_2', '1_4', '1_8', '1_16', '1_32'];
    
    foreach ($allowedKeys as $key) {
        $value = $counts[$key] ?? 0;
        if (!is_numeric($value) || $value < 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => "Invalid count for splitter type $key (must be >= 0)"
            ]);
            return;
        }
        $validatedCounts[$key] = (int)$value;
    }
    
    // Determine table name
    $table = $targetType === 'fat' ? 'network_fat' : 'network_closures';
    
    try {
        // Check if record exists
        $stmt = $db->prepare("SELECT id FROM $table WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => ucfirst($targetType) . " with ID $id not found"
            ]);
            return;
        }
        
        // Update splitter counts
        $stmt = $db->prepare("
            UPDATE $table
            SET 
                splitter_1_2_count = ?,
                splitter_1_4_count = ?,
                splitter_1_8_count = ?,
                splitter_1_16_count = ?,
                splitter_1_32_count = ?,
                splitters_updated_at = NOW(),
                splitters_updated_by = ?
            WHERE id = ?
        ");
        
        $stmt->execute([
            $validatedCounts['1_2'],
            $validatedCounts['1_4'],
            $validatedCounts['1_8'],
            $validatedCounts['1_16'],
            $validatedCounts['1_32'],
            $updatedBy,
            $id
        ]);
        
        // Calculate total splitters
        $totalSplitters = array_sum($validatedCounts);
        
        echo json_encode([
            'success' => true,
            'message' => 'Splitter counts updated successfully',
            'data' => [
                'targetType' => $targetType,
                'id' => (int)$id,
                'counts' => $validatedCounts,
                'totalSplitters' => $totalSplitters,
                'updatedBy' => $updatedBy,
                'updatedAt' => date('Y-m-d H:i:s')
            ]
        ]);
        
    } catch (PDOException $e) {
        error_log("Update splitter counts error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

/**
 * Resolve all qgis2web layer directories (local dev + deploy copies).
 */
function getQgisLayerDirectories() {
    $base = realpath(__DIR__ . '/..');
    $candidates = [
        $base . '/public/qgis2web_2025_09_22-15_58_48_034179/layers',
        $base . '/qgis2web_2025_09_22-15_58_48_034179/layers',
        $base . '/deploy-ready/qgis2web_2025_09_22-15_58_48_034179/layers',
    ];
    $dirs = [];
    foreach ($candidates as $dir) {
        if ($dir && is_dir($dir)) {
            $dirs[] = $dir;
        }
    }
    return array_values(array_unique($dirs));
}

function writeQgisLayerJs(array $dirs, $file, $varName, $collectionName, array $features, $overwriteEmpty = false) {
    if (empty($dirs)) {
        return [];
    }
    // Keep existing qgis2web export when DB has no rows for this layer (prevents wiping ADSS lines, etc.)
    if (empty($features) && !$overwriteEmpty) {
        return [];
    }
    $geojson = [
        'type' => 'FeatureCollection',
        'name' => $collectionName,
        'crs' => ['type' => 'name', 'properties' => ['name' => 'urn:ogc:def:crs:OGC:1.3:CRS84']],
        'features' => $features,
    ];
    $content = 'var ' . $varName . ' = ' . json_encode($geojson, JSON_UNESCAPED_UNICODE) . ';';
    $written = [];
    foreach ($dirs as $dir) {
        $path = $dir . '/' . $file;
        if (file_put_contents($path, $content) !== false) {
            $written[] = $file;
        }
    }
    return $written;
}

function dbLineToGeoJsonCoordinates($coordsJson) {
    $coords = is_string($coordsJson) ? json_decode($coordsJson, true) : $coordsJson;
    if (!is_array($coords)) {
        return [];
    }
    $out = [];
    foreach ($coords as $c) {
        if (!is_array($c) || count($c) < 2) {
            continue;
        }
        // Stored as [lat, lng] during import — convert back to GeoJSON [lng, lat]
        $out[] = [(float)$c[1], (float)$c[0]];
    }
    return $out;
}

function mapCableRowToLayerKey($row) {
    $meta = inferCableMetaFromImport(
        [
            'layer' => $row['layer_name'] ?? '',
            'type' => $row['cable_type'] ?? '',
            'description' => $row['description'] ?? '',
            'FID' => $row['fid'] ?? '',
        ],
        $row['layer_name'] ?? '',
        $row['cable_type'] ?? ''
    );
    $fileMap = [
        'powerDrop' => ['powerDrop_5.js', 'json_powerDrop_5', 'powerDrop_5'],
        'Proposed_adss' => ['Proposed_adss_19.js', 'json_Proposed_adss_19', 'Proposed_adss_19'],
        'Existing_12_adss' => ['Existing_12_adss_8.js', 'json_Existing_12_adss_8', 'Existing_12_adss_8'],
        '48C_ADSS' => ['48C_ADSS_7.js', 'json_48C_ADSS_7', '48C_ADSS_7'],
        '24C_ADSS' => ['24C_ADSS_6.js', 'json_24C_ADSS_6', '24C_ADSS_6'],
        '96C_ADSS' => ['48C_ADSS_7.js', 'json_48C_ADSS_7', '48C_ADSS_7'],
    ];
    return $fileMap[$meta['layer_name']] ?? ['24C_ADSS_6.js', 'json_24C_ADSS_6', '24C_ADSS_6'];
}

function inferCableMetaFromImport(array $props, $sourceFile = '', $cableHint = '') {
    $s = strtolower(trim(
        $cableHint . ' ' .
        ($props['layer'] ?? '') . ' ' .
        ($props['type'] ?? '') . ' ' .
        ($props['description'] ?? '') . ' ' .
        $sourceFile . ' ' .
        ($props['FID'] ?? '') . ' ' .
        ($props['fid'] ?? '')
    ));

    if (strpos($s, 'power') !== false && strpos($s, 'drop') !== false) {
        return ['cable_type' => 'Power Drop', 'layer_name' => 'powerDrop', 'is_proposed' => false];
    }
    if (strpos($s, 'proposed') !== false && strpos($s, 'adss') !== false) {
        return ['cable_type' => 'Proposed ADSS', 'layer_name' => 'Proposed_adss', 'is_proposed' => true];
    }
    if (strpos($s, '12') !== false && (strpos($s, 'adss') !== false || strpos($s, 'existing') !== false)) {
        return ['cable_type' => '12C Existing ADSS', 'layer_name' => 'Existing_12_adss', 'is_proposed' => false];
    }
    if (strpos($s, '48') !== false) {
        return ['cable_type' => '48C ADSS', 'layer_name' => '48C_ADSS', 'is_proposed' => false];
    }
    if (strpos($s, '96') !== false) {
        return ['cable_type' => '96C ADSS', 'layer_name' => '96C_ADSS', 'is_proposed' => false];
    }
    if (strpos($s, '24') !== false || strpos($s, 'adss') !== false) {
        return ['cable_type' => '24C ADSS', 'layer_name' => '24C_ADSS', 'is_proposed' => false];
    }

    $fallbackType = trim((string)($props['type'] ?? $props['layer'] ?? 'ADSS'));
    return ['cable_type' => $fallbackType, 'layer_name' => trim((string)($props['layer'] ?? '24C_ADSS')), 'is_proposed' => false];
}

function extractLineGeometriesFromGeoJson($geometry) {
    if (!$geometry || empty($geometry['type'])) {
        return [];
    }
    $coords = $geometry['coordinates'] ?? null;
    if (!is_array($coords)) {
        return [];
    }
    if ($geometry['type'] === 'LineString') {
        return [$coords];
    }
    if ($geometry['type'] === 'MultiLineString') {
        return $coords;
    }
    return [];
}

function computeLineLengthMeters(array $leafletCoords) {
    $total = 0.0;
    for ($i = 1, $n = count($leafletCoords); $i < $n; $i++) {
        $lat1 = deg2rad((float)$leafletCoords[$i - 1][0]);
        $lng1 = deg2rad((float)$leafletCoords[$i - 1][1]);
        $lat2 = deg2rad((float)$leafletCoords[$i][0]);
        $lng2 = deg2rad((float)$leafletCoords[$i][1]);
        $dlat = $lat2 - $lat1;
        $dlng = $lng2 - $lng1;
        $a = sin($dlat / 2) * sin($dlat / 2) + cos($lat1) * cos($lat2) * sin($dlng / 2) * sin($dlng / 2);
        $total += 6371000 * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
    return round($total, 2);
}

function mapPoleRowToLayerKey($row) {
    $s = strtolower(trim(($row['layer_name'] ?? '') . ' ' . ($row['pole_type'] ?? '')));
    if (strpos($s, 'mast') !== false) {
        return ['Tcom_Mast_30.js', 'json_Tcom_Mast_30', 'Tcom_Mast_30'];
    }
    if (strpos($s, 'proposed') !== false) {
        return ['Prop_tcom_pole_2.js', 'json_Prop_tcom_pole_2', 'Prop_tcom_pole_2'];
    }
    if (strpos($s, 'concrete') !== false) {
        return ['kplc_concrete_28.js', 'json_kplc_concrete_28', 'kplc_concrete_28'];
    }
    if (strpos($s, 'kplc') !== false) {
        return ['kplc_29.js', 'json_kplc_29', 'kplc_29'];
    }
    return ['Tcom_27.js', 'json_Tcom_27', 'Tcom_27'];
}

function networkHasLabelNumColumn($db, $table) {
    static $cache = [];
    if (!isset($cache[$table])) {
        $allowed = ['network_fat', 'network_closures'];
        if (!in_array($table, $allowed, true)) {
            $cache[$table] = false;
            return false;
        }
        try {
            $db->query("SELECT label_num FROM `$table` LIMIT 0");
            $cache[$table] = true;
        } catch (PDOException $e) {
            $cache[$table] = false;
        }
    }
    return $cache[$table];
}

function qgisPointFeatureFromRow($row, array $extraProps = []) {
    $props = [
        'ID' => (string)$row['id'],
        'FID' => (string)($row['fid'] ?? $row['id']),
        'description' => $row['description'] ?? '',
        'latitude' => (float)$row['latitude'],
        'longitude' => (float)$row['longitude'],
    ];
    if (array_key_exists('hub_name', $row)) {
        $props['HubName'] = $row['hub_name'] ?? '';
        $props['HubDist'] = $row['hub_distance'] ?? null;
    }
    if (isset($row['label_num']) && $row['label_num'] !== null && $row['label_num'] !== '') {
        $props['num'] = (float)$row['label_num'];
    }
    $props = array_merge($props, $extraProps);
    return [
        'type' => 'Feature',
        'properties' => $props,
        'geometry' => [
            'type' => 'Point',
            'coordinates' => [(float)$row['longitude'], (float)$row['latitude']],
        ],
    ];
}

function mapBuildingRowToLayerKey($row) {
    $t = strtoupper(trim(($row['building_type'] ?? '') . ' ' . ($row['layer_name'] ?? '')));
    if ($t === 'BU' || preg_match('/\bBU\b/', $t)) {
        return ['BU_25.js', 'json_BU_25', 'BU_25'];
    }
    if ($t === 'SDU' || preg_match('/\bSDU\b/', $t)) {
        return ['Sdu_24.js', 'json_Sdu_24', 'Sdu_24'];
    }
    if ($t === 'UC' || preg_match('/\bUC\b/', $t)) {
        return ['Uc_23.js', 'json_Uc_23', 'Uc_23'];
    }
    return ['Building_26.js', 'json_Building_26', 'Building_26'];
}

function mapMiscRowToLayerKey($row) {
    $s = strtolower(trim(($row['item_type'] ?? '') . ' ' . ($row['layer_name'] ?? '') . ' ' . ($row['description'] ?? '')));
    if (strpos($s, 'photo') !== false) {
        return ['Photos_1.js', 'json_Photos_1', 'Photos_1'];
    }
    if (strpos($s, 'atc') !== false) {
        return ['ATC_SITE_9.js', 'json_ATC_SITE_9', 'ATC_SITE_9'];
    }
    if (strpos($s, 'proposed') !== false && strpos($s, 'enclosure') !== false) {
        return ['Proposed_Enclosure_3.js', 'json_Proposed_Enclosure_3', 'Proposed_Enclosure_3'];
    }
    if (strpos($s, 'proposed') !== false && strpos($s, 'fat') !== false) {
        return ['Proposed_FAT_4.js', 'json_Proposed_FAT_4', 'Proposed_FAT_4'];
    }
    return null;
}

/**
 * Generate QGIS2Web layer files from database
 * This converts database records back into qgis2web JS layer format
 */
function generateQgis2webLayers($db) {
    try {
        $dirs = getQgisLayerDirectories();
        if (empty($dirs)) {
            return ['success' => false, 'error' => 'QGIS layer directory not found (public/qgis2web.../layers)'];
        }

        $generated = [];

        // FAT
        $fatFeatures = [];
        $fatCols = networkHasLabelNumColumn($db, 'network_fat') ? ', label_num' : '';
        $stmt = $db->query("SELECT id, fid, description, latitude, longitude, hub_name, hub_distance{$fatCols} FROM network_fat WHERE status = 'active' ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $fatFeatures[] = qgisPointFeatureFromRow($row);
        }
        $generated = array_merge($generated, writeQgisLayerJs($dirs, 'FAT_18.js', 'json_FAT_18', 'FAT_18', $fatFeatures));

        // Closures — map uses both 96C_Closure_17 and Closure_22
        $closureFeatures = [];
        $closureCols = networkHasLabelNumColumn($db, 'network_closures') ? ', label_num' : '';
        $stmt = $db->query("SELECT id, fid, description, latitude, longitude, hub_name, hub_distance{$closureCols} FROM network_closures WHERE status = 'active' ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $closureFeatures[] = qgisPointFeatureFromRow($row);
        }
        $generated = array_merge($generated, writeQgisLayerJs($dirs, 'Closure_22.js', 'json_Closure_22', 'Closure_22', $closureFeatures));
        $generated = array_merge($generated, writeQgisLayerJs($dirs, '96C_Closure_17.js', 'json_96C_Closure_17', '96C_Closure_17', $closureFeatures));

        // Splitters — variable names must match layers.js (e.g. json_1_2_splitter_14)
        $splitterMap = [
            '1:2' => ['1_2_splitter_14.js', 'json_1_2_splitter_14', '1_2_splitter_14'],
            '1:4' => ['1_4_splitter_13.js', 'json_1_4_splitter_13', '1_4_splitter_13'],
            '1:8' => ['1_8_splitter_12.js', 'json_1_8_splitter_12', '1_8_splitter_12'],
            '1:16' => ['1_16_splitter_11.js', 'json_1_16_splitter_11', '1_16_splitter_11'],
            '1:32' => ['1_32_splitter_10.js', 'json_1_32_splitter_10', '1_32_splitter_10'],
            '1:128' => ['Main_Splitters_128_64_15.js', 'json_Main_Splitters_128_64_15', 'Main_Splitters_128_64_15'],
            '1:64' => ['128_Mains_splitters_16.js', 'json_128_Mains_splitters_16', '128_Mains_splitters_16'],
        ];
        foreach ($splitterMap as $splitterType => [$file, $varName, $collectionName]) {
            $stmt = $db->prepare("SELECT id, fid, description, latitude, longitude, hub_name, hub_distance FROM network_splitters WHERE status = 'active' AND splitter_type = ? ORDER BY id");
            $stmt->execute([$splitterType]);
            $features = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $features[] = qgisPointFeatureFromRow($row);
            }
            $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, $varName, $collectionName, $features));
        }

        // Cables grouped into qgis2web layer files
        $cableGroups = [];
        $stmt = $db->query("SELECT id, fid, description, cable_type, coordinates, length_meters, layer_name FROM network_cables WHERE status IN ('active', 'proposed') ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = mapCableRowToLayerKey($row);
            $line = dbLineToGeoJsonCoordinates($row['coordinates']);
            if (count($line) < 2) {
                continue;
            }
            $cableGroups[$key[0]][] = [
                'type' => 'Feature',
                'properties' => [
                    'ID' => (string)$row['id'],
                    'FID' => (string)($row['fid'] ?? $row['id']),
                    'description' => $row['description'] ?? '',
                    'length' => $row['length_meters'] ?? null,
                ],
                'geometry' => ['type' => 'LineString', 'coordinates' => $line],
            ];
        }
        $cableLayerFiles = [
            '24C_ADSS_6.js' => ['json_24C_ADSS_6', '24C_ADSS_6'],
            '48C_ADSS_7.js' => ['json_48C_ADSS_7', '48C_ADSS_7'],
            'Existing_12_adss_8.js' => ['json_Existing_12_adss_8', 'Existing_12_adss_8'],
            'Proposed_adss_19.js' => ['json_Proposed_adss_19', 'Proposed_adss_19'],
            'powerDrop_5.js' => ['json_powerDrop_5', 'powerDrop_5'],
        ];
        foreach ($cableLayerFiles as $file => [$varName, $collectionName]) {
            $features = $cableGroups[$file] ?? [];
            $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, $varName, $collectionName, $features));
        }

        // Poles
        $poleGroups = [];
        $stmt = $db->query("SELECT id, fid, description, pole_type, latitude, longitude, layer_name FROM network_poles WHERE status = 'active' ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            [$file] = mapPoleRowToLayerKey($row);
            $poleGroups[$file][] = [
                'type' => 'Feature',
                'properties' => [
                    'ID' => (string)$row['id'],
                    'FID' => (string)($row['fid'] ?? $row['id']),
                    'description' => $row['description'] ?? '',
                    'latitude' => (float)$row['latitude'],
                    'longitude' => (float)$row['longitude'],
                ],
                'geometry' => [
                    'type' => 'Point',
                    'coordinates' => [(float)$row['longitude'], (float)$row['latitude']],
                ],
            ];
        }
        $poleVarMap = [
            'Tcom_27.js' => ['json_Tcom_27', 'Tcom_27'],
            'kplc_29.js' => ['json_kplc_29', 'kplc_29'],
            'kplc_concrete_28.js' => ['json_kplc_concrete_28', 'kplc_concrete_28'],
            'Prop_tcom_pole_2.js' => ['json_Prop_tcom_pole_2', 'Prop_tcom_pole_2'],
            'Tcom_Mast_30.js' => ['json_Tcom_Mast_30', 'Tcom_Mast_30'],
        ];
        foreach ($poleGroups as $file => $features) {
            if (!isset($poleVarMap[$file])) {
                continue;
            }
            [$varName, $collectionName] = $poleVarMap[$file];
            $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, $varName, $collectionName, $features));
        }

        // Hubs
        $hubFeatures = [];
        $stmt = $db->query("SELECT id, fid, name, description, latitude, longitude FROM network_hubs WHERE status = 'active' ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $hubFeatures[] = [
                'type' => 'Feature',
                'properties' => [
                    'id' => (string)$row['id'],
                    'HB' => $row['name'] ?? ('Hub ' . $row['id']),
                ],
                'geometry' => [
                    'type' => 'Point',
                    'coordinates' => [(float)$row['longitude'], (float)$row['latitude']],
                ],
            ];
        }
        $generated = array_merge($generated, writeQgisLayerJs($dirs, 'HUBS_20.js', 'json_HUBS_20', 'HUBS_20', $hubFeatures));

        // Transformers
        $transformerFeatures = [];
        $stmt = $db->query("SELECT id, fid, description, latitude, longitude FROM network_transformers WHERE status = 'active' ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $transformerFeatures[] = [
                'type' => 'Feature',
                'properties' => [
                    'ID' => (string)$row['id'],
                    'FID' => (string)($row['fid'] ?? $row['id']),
                    'description' => $row['description'] ?? '',
                    'latitude' => (float)$row['latitude'],
                    'longitude' => (float)$row['longitude'],
                ],
                'geometry' => [
                    'type' => 'Point',
                    'coordinates' => [(float)$row['longitude'], (float)$row['latitude']],
                ],
            ];
        }
        $generated = array_merge($generated, writeQgisLayerJs($dirs, 'Transformer_21.js', 'json_Transformer_21', 'Transformer_21', $transformerFeatures));

        // Buildings — split into legend layers (BU, SDU, UC, Building)
        $buildingGroups = [];
        $stmt = $db->query("SELECT id, fid, description, building_type, latitude, longitude, hub_name, hub_distance, layer_name FROM network_buildings WHERE status IN ('active', 'potential') ORDER BY id");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            [$file] = mapBuildingRowToLayerKey($row);
            $buildingGroups[$file][] = qgisPointFeatureFromRow($row);
        }
        $buildingVarMap = [
            'BU_25.js' => ['json_BU_25', 'BU_25'],
            'Sdu_24.js' => ['json_Sdu_24', 'Sdu_24'],
            'Uc_23.js' => ['json_Uc_23', 'Uc_23'],
            'Building_26.js' => ['json_Building_26', 'Building_26'],
        ];
        foreach ($buildingVarMap as $file => [$varName, $collectionName]) {
            $features = $buildingGroups[$file] ?? [];
            $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, $varName, $collectionName, $features));
        }

        // Misc (Photos, ATC site, proposed enclosure/FAT)
        $miscGroups = [];
        try {
            $stmt = $db->query("SELECT id, fid, description, item_type, latitude, longitude, layer_name FROM network_misc WHERE status = 'active' ORDER BY id");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = mapMiscRowToLayerKey($row);
                if (!$key) {
                    continue;
                }
                $miscGroups[$key[0]][] = qgisPointFeatureFromRow($row);
            }
        } catch (Exception $e) {
            // network_misc table may not exist on older installs
        }
        foreach ($miscGroups as $file => $features) {
            if ($file === 'Photos_1.js') {
                $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, 'json_Photos_1', 'Photos_1', $features));
            } elseif ($file === 'ATC_SITE_9.js') {
                $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, 'json_ATC_SITE_9', 'ATC_SITE_9', $features));
            } elseif ($file === 'Proposed_Enclosure_3.js') {
                $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, 'json_Proposed_Enclosure_3', 'Proposed_Enclosure_3', $features));
            } elseif ($file === 'Proposed_FAT_4.js') {
                $generated = array_merge($generated, writeQgisLayerJs($dirs, $file, 'json_Proposed_FAT_4', 'Proposed_FAT_4', $features));
            }
        }

        $generated = array_values(array_unique($generated));

        return [
            'success' => count($generated) > 0,
            'message' => 'Successfully generated QGIS2Web layer files',
            'generated' => $generated,
            'directories' => $dirs,
        ];
    } catch (Exception $e) {
        error_log("Generate QGIS2Web layers error: " . $e->getMessage());
        return [
            'success' => false,
            'error' => $e->getMessage(),
        ];
    }
}
?>
