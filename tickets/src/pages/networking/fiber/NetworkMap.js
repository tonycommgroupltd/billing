import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './NetworkMap.css';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Block, BlockHead, BlockTitle, BlockBetween, BlockHeadContent, Icon, Button } from "../../../components/Component";
import { Card, Spinner, Row, Col } from "reactstrap";

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom CSS for the map layer control (scrollable with icons)
var customMapStyles = document.createElement('style');
customMapStyles.textContent = `
  .leaflet-control-layers-overlays {
    max-height: 60vh;
    overflow-y: auto;
    padding-right: 5px;
  }
  .leaflet-control-layers-overlays label {
    display: flex !important;
    align-items: center;
    padding: 3px 0;
    font-size: 12px;
  }
  .leaflet-control-layers-overlays label img {
    margin-right: 6px;
    vertical-align: middle;
  }
  .leaflet-control-layers-separator {
    margin: 5px 0;
    border-top: 1px solid #ddd;
  }
  .leaflet-control-layers {
    max-width: 280px;
  }
  .custom-div-icon {
    background: transparent;
    border: none;
  }
`;
if (!document.querySelector('#network-map-styles')) {
  customMapStyles.id = 'network-map-styles';
  document.head.appendChild(customMapStyles);
}

// Custom icons using colored shapes (matching QGIS styles)
var createCircleIcon = function(color, size) {
  size = size || 12;
  return L.divIcon({
    className: 'custom-div-icon',
    html: '<div style="background-color: ' + color + '; width: ' + size + 'px; height: ' + size + 'px; border-radius: 50%; border: 1px solid rgba(35,35,35,0.8); box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
};

// Star icon for FAT (5-pointed star like QGIS)
var createStarIcon = function(color, size) {
  size = size || 20;
  return L.divIcon({
    className: 'custom-div-icon',
    html: '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="' + color + '" stroke="rgba(35,35,35,0.8)" stroke-width="1"/></svg>',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
};

// Triangle icon for Closures (like QGIS)
var createTriangleIcon = function(color, size) {
  size = size || 14;
  return L.divIcon({
    className: 'custom-div-icon',
    html: '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));"><polygon points="12,4 22,20 2,20" fill="' + color + '" stroke="rgba(35,35,35,0.8)" stroke-width="1"/></svg>',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
};

// Square icon
var createSquareIcon = function(color, size) {
  size = size || 12;
  return L.divIcon({
    className: 'custom-div-icon',
    html: '<div style="background-color: ' + color + '; width: ' + size + 'px; height: ' + size + 'px; border: 1px solid rgba(35,35,35,0.8); box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
};

// Custom icons for different infrastructure types (matching QGIS colors)
var icons = {
  // Core infrastructure
  fat: createStarIcon('#23ff23', 20),           // Green star (QGIS: rgba(35,255,35))
  proposedFat: createStarIcon('#95a5a6', 18),   // Gray star for proposed FAT
  closure: createTriangleIcon('#fcda00', 14),   // Yellow triangle (QGIS: rgba(252,218,0))
  closure96c: createTriangleIcon('#ff6600', 16), // Orange triangle for 96C closures
  hub: createCircleIcon('#beb297', 20),         // Beige circle (QGIS: rgba(190,178,151))
  
  // Splitters by ratio
  splitter1_2: createSquareIcon('#00ff00', 10),   // Green - 1:2
  splitter1_4: createSquareIcon('#00cc00', 10),   // Darker green - 1:4
  splitter1_8: createSquareIcon('#009900', 12),   // Even darker - 1:8
  splitter1_16: createSquareIcon('#006600', 12),  // Dark green - 1:16
  splitter1_32: createSquareIcon('#003300', 14),  // Very dark green - 1:32
  splitter128: createSquareIcon('#9b59b6', 16),   // Purple - 128 main
  splitterMain: createSquareIcon('#8e44ad', 14),  // Dark purple - main splitters
  
  // Poles
  poleTcom: createCircleIcon('#1abc9c', 10),      // Teal circle
  poleTcomProposed: createCircleIcon('#95a5a6', 10), // Gray for proposed
  poleKplc: createCircleIcon('#e67e22', 10),      // Orange circle
  poleKplcConcrete: createSquareIcon('#d35400', 10), // Darker orange square
  tcomMast: createCircleIcon('#c0392b', 14),      // Red circle for mast
  
  // Buildings & Sites
  building: createSquareIcon('#3498db', 12),     // Blue square
  bu: createSquareIcon('#2980b9', 10),           // Darker blue
  sdu: createSquareIcon('#1abc9c', 10),          // Teal
  uc: createSquareIcon('#27ae60', 10),           // Green (customers)
  atcSite: createCircleIcon('#c0392b', 16),      // Red circle
  
  // Other
  transformer: createCircleIcon('#f39c12', 14),  // Yellow/orange circle
  proposedEnclosure: createSquareIcon('#7f8c8d', 12), // Gray square
  powerDrop: createCircleIcon('#e74c3c', 8),     // Small red circle
  photo: createCircleIcon('#3498db', 8),         // Small blue circle
  customer: createCircleIcon('#e74c3c', 10),     // Red circle
};

// Cable colors (matching QGIS styles exactly) - with higher z-index to appear on top
var cableColors = {
  '24C ADSS': { color: '#ff9600', weight: 5, opacity: 1.0, pane: 'cablesPane' },           // Orange (QGIS: rgba(255,150,0))
  '48C ADSS': { color: '#1abf1a', weight: 6, opacity: 1.0, pane: 'cablesPane' },           // Green (QGIS: rgba(26,191,26))
  '96C': { color: '#ff0000', weight: 7, opacity: 1.0, pane: 'cablesPane' },                // Red
  '12C Existing': { color: '#1f78b4', weight: 4, opacity: 1.0, pane: 'cablesPane' },       // Blue (QGIS: rgba(31,120,180))
  'Proposed ADSS': { color: '#969696', weight: 4, opacity: 1.0, dashArray: '8, 6', pane: 'cablesPane' }, // Gray dashed (QGIS: rgba(150,150,150))
  'Power Drop': { color: '#e31a1c', weight: 4, opacity: 1.0, pane: 'cablesPane' },         // Red (QGIS: rgba(227,26,28))
  'default': { color: '#7f8c8d', weight: 4, opacity: 1.0, pane: 'cablesPane' }
};

var NetworkMap = function() {
  var mapRef = useRef(null);
  var mapInstanceRef = useRef(null);
  var layerGroupsRef = useRef({});
  var svgRendererRef = useRef(null);
  var cablesRendererRef = useRef(null);
  
  var dataState = useState({
    fat: [], closures: [], splitters: [], hubs: [],
    transformers: [], poles: [], cables: [], customers: [],
    buildings: [], misc: [], stats: {}
  });
  var data = dataState[0];
  var setData = dataState[1];
  
  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];
  
  var errorState = useState(null);
  var error = errorState[0];
  var setError = errorState[1];
  
  var mapReadyState = useState(false);
  var mapReady = mapReadyState[0];
  var setMapReady = mapReadyState[1];

  // Fullscreen state for map only
  var fullscreenState = useState(false);
  var isFullscreen = fullscreenState[0];
  var setIsFullscreen = fullscreenState[1];

  // Center on your network (Nakuru area based on QGIS data)
  var center = [-0.255, 36.115];

  // Toggle fullscreen for map only
  var toggleFullscreen = useCallback(function() {
    setIsFullscreen(function(prev) { return !prev; });
    // Invalidate map size after state change
    setTimeout(function() {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 100);
  }, []);

  // Handle ESC key to exit fullscreen
  useEffect(function() {
    var handleKeyDown = function(e) {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        setTimeout(function() {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        }, 100);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return function() {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Initialize map
  useEffect(function() {
    if (mapRef.current && !mapInstanceRef.current) {
      console.log('Initializing network map with coordinates:', center);
      
      // Create map instance with better options
      var map = L.map(mapRef.current, {
        center: center,
        zoom: 13,
        scrollWheelZoom: true,
        preferCanvas: true,
        zoomControl: true
      });
      
      console.log('✅ Map initialized at coordinates:', center);

      // Base layers
      var streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      });

      var satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google'
      });

      var hybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google'
      });

      var terrain = L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google'
      });

      // Add default layer
      satellite.addTo(map);

      console.log('Map created successfully');
      
      // Create cable pane for better layering
      try {
        map.createPane('cablesPane');
        map.getPane('cablesPane').style.zIndex = 450;
      } catch (e) {
        console.warn('Could not create cables pane:', e);
      }

      // Layer control
      var baseLayers = {
        "Street Map": streetMap,
        "Satellite": satellite,
        "Hybrid (Satellite + Labels)": hybrid,
        "Terrain": terrain
      };

      // Create empty layer groups for overlays (grouped by category)
      layerGroupsRef.current = {
        // Core Infrastructure (visible by default)
        hubs: L.layerGroup().addTo(map),
        fat: L.layerGroup().addTo(map),
        proposedFat: L.layerGroup(),
        closures: L.layerGroup().addTo(map),
        closures96c: L.layerGroup(),
        
        // Splitters (by ratio)
        splitters1_2: L.layerGroup(),
        splitters1_4: L.layerGroup(),
        splitters1_8: L.layerGroup(),
        splitters1_16: L.layerGroup().addTo(map),
        splitters1_32: L.layerGroup(),
        splitters128: L.layerGroup(),
        splittersMain: L.layerGroup(),
        
        // Cables (visible by default)
        cables24c: L.layerGroup().addTo(map),
        cables48c: L.layerGroup().addTo(map),
        cables12c: L.layerGroup().addTo(map),
        cablesProposed: L.layerGroup().addTo(map),
        powerDrop: L.layerGroup().addTo(map),
        
        // Poles
        tcomPoles: L.layerGroup(),
        tcomPolesProposed: L.layerGroup(),
        kplcPoles: L.layerGroup(),
        kplcConcrete: L.layerGroup(),
        tcomMast: L.layerGroup(),
        
        // Buildings & Sites
        buildings: L.layerGroup(),
        bu: L.layerGroup(),
        sdu: L.layerGroup(),
        uc: L.layerGroup(),
        atcSite: L.layerGroup(),
        proposedEnclosure: L.layerGroup(),
        
        // Other
        transformers: L.layerGroup(),
        photos: L.layerGroup(),
        customers: L.layerGroup().addTo(map)
      };

      var overlays = {
        // Core Infrastructure
        "<img src='/images/legend/HUBS_20.png' width='16'/> Hubs": layerGroupsRef.current.hubs,
        "<img src='/images/legend/FAT_18.png' width='16'/> FAT Points": layerGroupsRef.current.fat,
        "<img src='/images/legend/Proposed_FAT_4.png' width='16'/> Proposed FAT": layerGroupsRef.current.proposedFat,
        "<img src='/images/legend/Closure_22.png' width='16'/> Closures": layerGroupsRef.current.closures,
        "<img src='/images/legend/96C_Closure_17.png' width='16'/> 96C Closures": layerGroupsRef.current.closures96c,
        
        // Splitters
        "<img src='/images/legend/1_2_splitter_14.png' width='16'/> 1:2 Splitters": layerGroupsRef.current.splitters1_2,
        "<img src='/images/legend/1_4_splitter_13.png' width='16'/> 1:4 Splitters": layerGroupsRef.current.splitters1_4,
        "<img src='/images/legend/1_8_splitter_12.png' width='16'/> 1:8 Splitters": layerGroupsRef.current.splitters1_8,
        "<img src='/images/legend/1_16_splitter_11.png' width='16'/> 1:16 Splitters": layerGroupsRef.current.splitters1_16,
        "<img src='/images/legend/1_32_splitter_10.png' width='16'/> 1:32 Splitters": layerGroupsRef.current.splitters1_32,
        "<img src='/images/legend/128_Mains_splitters_16.png' width='16'/> 128 Main Splitters": layerGroupsRef.current.splitters128,
        "<img src='/images/legend/Main_Splitters_128_64_15.png' width='16'/> Main Splitters": layerGroupsRef.current.splittersMain,
        
        // Cables
        "<img src='/images/legend/24C_ADSS_6.png' width='16'/> 24C ADSS": layerGroupsRef.current.cables24c,
        "<img src='/images/legend/48C_ADSS_7.png' width='16'/> 48C ADSS": layerGroupsRef.current.cables48c,
        "<img src='/images/legend/Existing_12_adss_8.png' width='16'/> Existing 12C ADSS": layerGroupsRef.current.cables12c,
        "<img src='/images/legend/Proposed_adss_19.png' width='16'/> Proposed ADSS": layerGroupsRef.current.cablesProposed,
        "<img src='/images/legend/powerDrop_5.png' width='16'/> Power Drop": layerGroupsRef.current.powerDrop,
        
        // Poles
        "<img src='/images/legend/Tcom_27.png' width='16'/> Tcom Poles": layerGroupsRef.current.tcomPoles,
        "<img src='/images/legend/Prop_tcom_pole_2.png' width='16'/> Proposed Tcom Poles": layerGroupsRef.current.tcomPolesProposed,
        "<img src='/images/legend/kplc_29.png' width='16'/> KPLC Poles": layerGroupsRef.current.kplcPoles,
        "<img src='/images/legend/kplc_concrete_28.png' width='16'/> KPLC Concrete": layerGroupsRef.current.kplcConcrete,
        "<img src='/images/legend/Tcom_Mast_30.png' width='16'/> Tcom Mast": layerGroupsRef.current.tcomMast,
        
        // Buildings & Sites
        "<img src='/images/legend/Building_26.png' width='16'/> Buildings": layerGroupsRef.current.buildings,
        "<img src='/images/legend/BU_25.png' width='16'/> BU": layerGroupsRef.current.bu,
        "<img src='/images/legend/Sdu_24.png' width='16'/> SDU": layerGroupsRef.current.sdu,
        "<img src='/images/legend/Uc_23.png' width='16'/> UC (Customers)": layerGroupsRef.current.uc,
        "<img src='/images/legend/ATC_SITE_9.png' width='16'/> ATC Sites": layerGroupsRef.current.atcSite,
        "<img src='/images/legend/Proposed_Enclosure_3.png' width='16'/> Proposed Enclosure": layerGroupsRef.current.proposedEnclosure,
        
        // Other
        "<img src='/images/legend/Transformer_21.png' width='16'/> Transformers": layerGroupsRef.current.transformers,
        "<img src='/images/legend/Photos_1.png' width='16'/> Photos": layerGroupsRef.current.photos,
        "👤 Customers": layerGroupsRef.current.customers
      };

      L.control.layers(baseLayers, overlays, { position: 'topright', collapsed: false }).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);
    }

    // Cleanup on unmount
    return function() {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Separate useEffect for resize handling - runs after map is ready
  useEffect(function() {
    if (!mapReady || !mapInstanceRef.current) return;
    
    var resizeTimeout = null;
    
    var handleResize = function() {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      
      resizeTimeout = setTimeout(function() {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false, pan: false });
        }
      }, 150);
    };
    
    // Listen for resize events
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // ResizeObserver for container changes
    var resizeObserver = null;
    var mapContainer = document.querySelector('.network-map-container');
    if (mapContainer && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(mapContainer);
    }
    
    // Initial invalidateSize
    setTimeout(function() {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    }, 500);
    
    return function() {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [mapReady]);

  // Load data
  useEffect(function() {
    loadAllData();
  }, []);

  var loadAllData = function(fullLoad) {
    setLoading(true);
    setError(null);
    var apiUrl = process.env.REACT_APP_API_URL || '/api';
    
    // Use lite mode on mobile for faster loading (unless fullLoad is requested)
    var isMobile = window.innerWidth < 768;
    var useLite = isMobile && !fullLoad;
    var url = apiUrl + '/network-map.php' + (useLite ? '?lite=1' : '');
    
    console.log('🔄 Loading network data from:', url, useLite ? '(lite mode)' : '(full mode)');
    
    fetch(url)
      .then(function(response) {
        console.log('📡 API Response status:', response.status);
        if (!response.ok) {
          throw new Error('Failed to fetch network data (HTTP ' + response.status + ')');
        }
        return response.json();
      })
      .then(function(result) {
        console.log('✅ Network data loaded successfully:', result.stats);
        if (result.success !== false) {
          setData(result);
          // Log coordinate information
          if (result.fat && result.fat.length > 0) {
            console.log('🗺️ Map coordinates found - showing fiber network at:', center);
            var firstPoint = result.fat[0];
            if (firstPoint.latitude && firstPoint.longitude) {
              console.log('📍 First data point at:', [firstPoint.latitude, firstPoint.longitude]);
            }
          }
        } else {
          throw new Error(result.error || 'Failed to load data');
        }
      })
      .catch(function(err) {
        console.error('❌ Error loading map data:', err);
        setError('Map data unavailable: ' + err.message);
        // Still show the map with base layers
        console.log('⚠️ Showing map with base layers only');
      })
      .finally(function() {
        setLoading(false);
      });
  };

  // Update map markers when data changes
  useEffect(function() {
    if (!mapReady || !mapInstanceRef.current) return;

    var layers = layerGroupsRef.current;
    var map = mapInstanceRef.current;
    
    // Process items in chunks to prevent UI freeze
    var processInChunks = function(items, processItem, chunkSize, callback) {
      chunkSize = chunkSize || 50;
      var index = 0;
      
      var processChunk = function() {
        var end = Math.min(index + chunkSize, items.length);
        for (var i = index; i < end; i++) {
          processItem(items[i]);
        }
        index = end;
        
        if (index < items.length) {
          // Use requestAnimationFrame for smoother processing
          requestAnimationFrame(processChunk);
        } else if (callback) {
          callback();
        }
      };
      
      if (items.length > 0) {
        processChunk();
      } else if (callback) {
        callback();
      }
    };

    // Always keep cable layers enabled (no need to tick them in the layer control).
    // If the layer control removes them, we add them back before drawing.
    var ensureOnMap = function(layerGroup) {
      if (!layerGroup) return;
      try {
        if (map && !map.hasLayer(layerGroup)) {
          layerGroup.addTo(map);
        }
      } catch (e) {
        // no-op
      }
    };
    ensureOnMap(layers.cables24c);
    ensureOnMap(layers.cables48c);
    ensureOnMap(layers.cables12c);
    ensureOnMap(layers.cablesProposed);
    ensureOnMap(layers.powerDrop);

    // Clear all layers first
    Object.keys(layers).forEach(function(key) {
      layers[key].clearLayers();
    });

    // Add Hubs (small dataset - process synchronously)
    (data.hubs || []).forEach(function(item) {
      if (item.latitude && item.longitude) {
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icons.hub });
        marker.bindPopup('<div class="fw-bold text-success">HUB</div>' +
          '<div>' + (item.name || 'Unnamed Hub') + '</div>' +
          (item.description ? '<div class="small text-muted">' + item.description + '</div>' : ''));
        layers.hubs.addLayer(marker);
      }
    });

    // Process FAT Points in chunks
    processInChunks(data.fat || [], function(item) {
      if (item.latitude && item.longitude) {
        var isProposed = (item.layer_name || '').toLowerCase().indexOf('proposed') >= 0;
        var icon = isProposed ? icons.proposedFat : icons.fat;
        var layer = isProposed ? layers.proposedFat : layers.fat;
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icon });
        marker.bindPopup('<div class="fw-bold text-danger">FAT #' + (item.fid || item.id) + '</div>' +
          (item.description ? '<div class="small">' + item.description + '</div>' : '') +
          (item.hub_name ? '<div class="small text-muted">Hub: ' + item.hub_name + ' • ' + 
            (item.hub_distance ? parseFloat(item.hub_distance).toFixed(0) + 'm' : 'N/A') + '</div>' : ''));
        layer.addLayer(marker);
      }
    }, 30);

    // Process Closures in chunks
    processInChunks(data.closures || [], function(item) {
      if (item.latitude && item.longitude) {
        var is96c = (item.layer_name || '').indexOf('96C') >= 0;
        var icon = is96c ? icons.closure96c : icons.closure;
        var layer = is96c ? layers.closures96c : layers.closures;
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icon });
        marker.bindPopup('<div class="fw-bold text-warning">Closure #' + (item.fid || item.id) + '</div>' +
          (is96c ? '<div class="badge bg-warning">96C</div>' : '') +
          (item.description ? '<div class="small">' + item.description + '</div>' : '') +
          (item.hub_name ? '<div class="small text-muted">Hub: ' + item.hub_name + '</div>' : ''));
        layer.addLayer(marker);
      }
    }, 30);

    // Process Splitters in chunks
    processInChunks(data.splitters || [], function(item) {
      if (item.latitude && item.longitude) {
        var splitterType = (item.splitter_type || item.layer_name || '').toLowerCase();
        var icon, layer;
        
        if (splitterType.indexOf('128') >= 0 || splitterType.indexOf('mains') >= 0) {
          icon = icons.splitter128;
          layer = layers.splitters128;
        } else if (splitterType.indexOf('main') >= 0 || splitterType.indexOf('64') >= 0) {
          icon = icons.splitterMain;
          layer = layers.splittersMain;
        } else if (splitterType.indexOf('1:32') >= 0 || splitterType.indexOf('1_32') >= 0) {
          icon = icons.splitter1_32;
          layer = layers.splitters1_32;
        } else if (splitterType.indexOf('1:16') >= 0 || splitterType.indexOf('1_16') >= 0) {
          icon = icons.splitter1_16;
          layer = layers.splitters1_16;
        } else if (splitterType.indexOf('1:8') >= 0 || splitterType.indexOf('1_8') >= 0) {
          icon = icons.splitter1_8;
          layer = layers.splitters1_8;
        } else if (splitterType.indexOf('1:4') >= 0 || splitterType.indexOf('1_4') >= 0) {
          icon = icons.splitter1_4;
          layer = layers.splitters1_4;
        } else if (splitterType.indexOf('1:2') >= 0 || splitterType.indexOf('1_2') >= 0) {
          icon = icons.splitter1_2;
          layer = layers.splitters1_2;
        } else {
          icon = icons.splitter1_16;
          layer = layers.splitters1_16;
        }
        
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icon });
        marker.bindPopup('<div class="fw-bold" style="color: #9b59b6">Splitter ' + (item.splitter_type || '') + '</div>' +
          (item.description ? '<div class="small">' + item.description + '</div>' : '') +
          (item.hub_distance ? '<div class="small text-muted">Distance: ' + parseFloat(item.hub_distance).toFixed(0) + 'm</div>' : ''));
        layer.addLayer(marker);
      }
    }, 30);

    // Process Cables in chunks (most expensive operation)
    console.log('Processing cables:', (data.cables || []).length, 'cables');
    
    processInChunks(data.cables || [], function(cable) {
      if (cable.coordinates && cable.coordinates.length > 0) {
        var cableType = (cable.cable_type || cable.layer_name || '').toLowerCase();
        var layer, style;
        
        // Determine layer and style based on cable type
        if (cableType.indexOf('power') >= 0 || cableType.indexOf('drop') >= 0) {
          layer = layers.powerDrop;
          style = cableColors['Power Drop'];
        } else if (cableType.indexOf('proposed') >= 0) {
          layer = layers.cablesProposed;
          style = cableColors['Proposed ADSS'];
        } else if (cableType.indexOf('adss') >= 0 && cableType.indexOf('48') >= 0) {
          layer = layers.cables48c;
          style = cableColors['48C ADSS'];
        } else if (cableType.indexOf('adss') >= 0 && cableType.indexOf('24') >= 0) {
          layer = layers.cables24c;
          style = cableColors['24C ADSS'];
        } else if (cableType.indexOf('adss') >= 0) {
          layer = layers.cables24c;
          style = cableColors['24C ADSS'];
        } else if (cableType.indexOf('48c') >= 0) {
          layer = layers.cables48c;
          style = cableColors['48C ADSS'];
        } else if (cableType.indexOf('12c') >= 0 || cableType.indexOf('existing') >= 0) {
          layer = layers.cables12c;
          style = cableColors['12C Existing'];
        } else if (cableType.indexOf('24c') >= 0) {
          layer = layers.cables24c;
          style = cableColors['24C ADSS'];
        } else if (cableType.indexOf('96c') >= 0) {
          layer = layers.cables24c; // Put with 24C for now
          style = cableColors['96C'];
        } else {
          layer = layers.cables24c;
          style = cableColors['24C ADSS'];
        }
        
        // Convert coordinates - handle both formats
        var coords = cable.coordinates;
        if (typeof coords === 'string') {
          try {
            coords = JSON.parse(coords);
          } catch (e) {
            console.error('Failed to parse cable coordinates:', e);
            return;
          }
        }
        
        // Convert [lng, lat] to [lat, lng] for Leaflet if needed
        // Kenya coordinates: longitude ~36-37, latitude ~-0.2 to -0.3
        coords = coords.map(function(coord) {
          if (Array.isArray(coord) && coord.length >= 2) {
            // Check if it looks like [lng, lat] (longitude typically > 30 for Kenya)
            if (Math.abs(coord[0]) > Math.abs(coord[1])) {
              return [coord[1], coord[0]]; // Swap to [lat, lng]
            }
            return coord;
          }
          return coord;
        });
        
        // Create polyline with simpler options
        var polylineOptions = {
          color: style.color,
          weight: style.weight,
          opacity: style.opacity
        };
        if (style.dashArray) {
          polylineOptions.dashArray = style.dashArray;
        }

        var polyline = L.polyline(coords, polylineOptions);
        
        polyline.bindPopup('<div class="fw-bold" style="color: ' + style.color + '">' + (cable.cable_type || cable.fid || 'Cable') + '</div>' +
          '<div class="small"><strong>ID:</strong> ' + (cable.fid || cable.id || 'N/A') + '</div>' +
          (cable.description ? '<div class="small">' + cable.description.replace(/\n/g, '<br>') + '</div>' : '') +
          (cable.length_meters ? '<div class="small text-muted">Length: ' + parseFloat(cable.length_meters).toFixed(0) + 'm</div>' : ''));
        
        // Add to layer group
        layer.addLayer(polyline);
      }
    }, 20, function() {
      console.log('Cables added to layers successfully');
      
      // Fit map to show all infrastructure after cables are loaded
      setTimeout(function() {
        var allLayers = [];
        Object.keys(layers).forEach(function(key) {
          layers[key].eachLayer(function(layer) {
            allLayers.push(layer);
          });
        });
        
        if (allLayers.length > 0 && mapInstanceRef.current) {
          var group = L.featureGroup(allLayers);
          var bounds = group.getBounds();
          mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });
          console.log('Map fitted to show all infrastructure');
        }
      }, 500);
    });
    
    console.log('Map data rendering started (async)');

    // Process Transformers in chunks
    processInChunks(data.transformers || [], function(item) {
      if (item.latitude && item.longitude) {
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icons.transformer });
        marker.bindPopup('<div class="fw-bold text-info">Transformer #' + (item.fid || item.id) + '</div>' +
          (item.description ? '<div class="small">' + item.description + '</div>' : ''));
        layers.transformers.addLayer(marker);
      }
    }, 30);

    // Process Poles in chunks
    processInChunks(data.poles || [], function(item) {
      if (item.latitude && item.longitude) {
        var poleType = (item.pole_type || item.layer_name || '').toLowerCase();
        var icon, layer;
        
        if (poleType.indexOf('mast') >= 0) {
          icon = icons.tcomMast;
          layer = layers.tcomMast;
        } else if (poleType.indexOf('proposed') >= 0 || poleType.indexOf('prop') >= 0) {
          icon = icons.poleTcomProposed;
          layer = layers.tcomPolesProposed;
        } else if (poleType.indexOf('concrete') >= 0) {
          icon = icons.poleKplcConcrete;
          layer = layers.kplcConcrete;
        } else if (poleType.indexOf('kplc') >= 0) {
          icon = icons.poleKplc;
          layer = layers.kplcPoles;
        } else if (poleType.indexOf('tcom') >= 0) {
          icon = icons.poleTcom;
          layer = layers.tcomPoles;
        } else {
          icon = icons.poleTcom;
          layer = layers.tcomPoles;
        }
        
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icon });
        marker.bindPopup('<div class="fw-bold">' + (item.pole_type || 'Pole') + '</div>' +
          (item.description ? '<div class="small">' + item.description + '</div>' : ''));
        layer.addLayer(marker);
      }
    }, 30);

    // Process Buildings in chunks
    processInChunks(data.buildings || [], function(item) {
      if (item.latitude && item.longitude) {
        var buildingType = (item.building_type || item.layer_name || '').toLowerCase();
        var icon, layer;
        
        if (buildingType.indexOf('atc') >= 0) {
          icon = icons.atcSite;
          layer = layers.atcSite;
        } else if (buildingType.indexOf('enclosure') >= 0 || buildingType.indexOf('proposed') >= 0) {
          icon = icons.proposedEnclosure;
          layer = layers.proposedEnclosure;
        } else if (buildingType.indexOf('bu') >= 0) {
          icon = icons.bu;
          layer = layers.bu;
        } else if (buildingType.indexOf('sdu') >= 0) {
          icon = icons.sdu;
          layer = layers.sdu;
        } else if (buildingType.indexOf('uc') >= 0) {
          icon = icons.uc;
          layer = layers.uc;
        } else {
          icon = icons.building;
          layer = layers.buildings;
        }
        
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icon });
        marker.bindPopup('<div class="fw-bold">' + (item.building_type || 'Building') + '</div>' +
          (item.description ? '<div class="small">' + item.description + '</div>' : ''));
        layer.addLayer(marker);
      }
    }, 30);

    // Process Misc items in chunks
    processInChunks(data.misc || [], function(item) {
      if (item.latitude && item.longitude) {
        var itemType = (item.item_type || item.layer_name || '').toLowerCase();
        var icon, layer;
        
        if (itemType.indexOf('photo') >= 0) {
          icon = icons.photo;
          layer = layers.photos;
        } else if (itemType.indexOf('power') >= 0 || itemType.indexOf('drop') >= 0) {
          icon = icons.powerDrop;
          layer = layers.powerDrop;
        } else {
          icon = icons.photo;
          layer = layers.photos;
        }
        
        var marker = L.marker([parseFloat(item.latitude), parseFloat(item.longitude)], { icon: icon });
        marker.bindPopup('<div class="fw-bold">' + (item.item_type || 'Item') + '</div>' +
          (item.description ? '<div class="small">' + item.description + '</div>' : ''));
        layer.addLayer(marker);
      }
    }, 30);

    // Process Customers in chunks
    processInChunks(data.customers || [], function(customer) {
      if (customer.latitude && customer.longitude) {
        var marker = L.marker([parseFloat(customer.latitude), parseFloat(customer.longitude)], { icon: icons.customer });
        marker.bindPopup('<div class="fw-bold">' + customer.full_name + '</div>' +
          '<div class="small">' + customer.phone + '</div>' +
          '<div class="mt-2">' +
          '<a href="/admin/customers/view/' + customer.id + '" class="btn btn-xs btn-primary me-1">View</a>' +
          '<a href="/admin/tickets/create?customer=' + customer.id + '" class="btn btn-xs btn-outline-secondary">Ticket</a>' +
          '</div>');
        layers.customers.addLayer(marker);
      }
    }, 30);

  }, [data, mapReady]);

  var refreshMapView = function() {
    loadAllData(true);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize({ animate: false, pan: false });
      setTimeout(function() {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false });
        }
      }, 300);
    }
  };

  var stats = data.stats || {};

  return (
    <React.Fragment>
      <Head title="Network Map - Fiber Structure" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="map" className="me-2" />
                Fiber Network Map
              </BlockTitle>
              <p className="text-soft">
                Live from database — after GeoJSON import, click <strong>Reload data</strong> (no redeploy needed).
              </p>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to="/admin/networking/fiber/map-qgis" className="btn btn-outline-light btn-sm me-2 d-none d-md-inline-flex">
                QGIS view
              </Link>
              <Button color="warning" className="me-2" onClick={refreshMapView} disabled={loading}>
                <Icon name="reload" className="me-1" />
                {loading ? 'Loading…' : 'Reload data'}
              </Button>
              <Button color="light" className="me-2" onClick={function() {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.setView(center, 15);
                }
              }}>
                <Icon name="focus" className="me-1" />
                Re-center
              </Button>
              <Button color="primary" outline onClick={function() { loadAllData(true); }} disabled={loading}>
                <Icon name="download" className="me-1" />
                {loading ? 'Loading…' : 'Full load'}
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {/* Stats Cards */}
        <Block>
          <Row className="g-3 mb-3">
            <Col sm="6" md="4" lg="2">
              <Card className="card-bordered text-center p-2">
                <div className="fs-4 fw-bold text-danger">{stats.fat_count || 0}</div>
                <div className="text-soft small">FAT Points</div>
              </Card>
            </Col>
            <Col sm="6" md="4" lg="2">
              <Card className="card-bordered text-center p-2">
                <div className="fs-4 fw-bold text-warning">{stats.closure_count || 0}</div>
                <div className="text-soft small">Closures</div>
              </Card>
            </Col>
            <Col sm="6" md="4" lg="2">
              <Card className="card-bordered text-center p-2">
                <div className="fs-4 fw-bold" style={{color: '#9b59b6'}}>{stats.splitter_count || 0}</div>
                <div className="text-soft small">Splitters</div>
              </Card>
            </Col>
            <Col sm="6" md="4" lg="2">
              <Card className="card-bordered text-center p-2">
                <div className="fs-4 fw-bold text-info">{stats.cable_count || 0}</div>
                <div className="text-soft small">Cables</div>
              </Card>
            </Col>
            <Col sm="6" md="4" lg="2">
              <Card className="card-bordered text-center p-2">
                <div className="fs-4 fw-bold text-success">{stats.hub_count || 0}</div>
                <div className="text-soft small">Hubs</div>
              </Card>
            </Col>
            <Col sm="6" md="4" lg="2">
              <Card className="card-bordered text-center p-2">
                <div className="fs-4 fw-bold text-primary">{stats.customers_with_location || 0}</div>
                <div className="text-soft small">Customers</div>
              </Card>
            </Col>
          </Row>
        </Block>

        <Block>
          <div className={isFullscreen ? "map-fullscreen-overlay" : ""}>
            <Card className={isFullscreen ? "card-bordered map-fullscreen-card" : "card-bordered"}>
              <div 
                className="card-inner p-0 network-map-container" 
                style={{ 
                  position: 'relative', 
                  height: isFullscreen ? '100vh' : '600px', 
                  minHeight: '500px',
                  width: '100%'
                }}
              >
                {/* Fullscreen Toggle Button */}
                <Button 
                  color={isFullscreen ? "danger" : "light"} 
                  size="sm"
                  className="map-fullscreen-btn"
                  onClick={toggleFullscreen}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 1001,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                  }}
                >
                  <Icon name={isFullscreen ? "minimize" : "maximize"} className="me-1" />
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </Button>

                {/* Refresh Map Button - for fixing display issues on mobile desktop mode */}
                <Button 
                  color="warning" 
                  size="sm"
                  onClick={refreshMapView}
                  disabled={loading}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: isFullscreen ? '160px' : '130px',
                    zIndex: 1001,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                  }}
                >
                  <Icon name="reload" className="me-1" />
                  {loading ? 'Loading…' : 'Reload'}
                </Button>

                {loading && (
                  <div className="d-flex justify-content-center align-items-center" 
                       style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                                backgroundColor: 'rgba(255,255,255,0.8)', zIndex: 1000 }}>
                    <Spinner color="primary" />
                    <span className="ms-2">Loading map data...</span>
                  </div>
                )}
                
                {error && (
                  <div className="alert alert-danger m-3">
                    <Icon name="alert-circle" className="me-2" />
                    {error}
                    <Button color="primary" size="sm" className="ms-3" onClick={loadAllData}>
                      Try Again
                    </Button>
                  </div>
                )}
                
                {/* Map Container - using absolute positioning to guarantee size */}
                <div 
                  ref={mapRef} 
                  id="fiber-network-map"
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 1
                  }}
                />
              </div>
            </Card>
          </div>
        </Block>

        {/* Legend - Using QGIS Style Icons */}
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <h6 className="mb-3">Map Legend</h6>
              <Row className="g-3">
                {/* Infrastructure Points */}
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/HUBS_20.png" alt="Hub" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Hubs</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/FAT_18.png" alt="FAT" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">FAT Points</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Closure_22.png" alt="Closure" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Closures</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/96C_Closure_17.png" alt="96C Closure" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">96C Closure</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Transformer_21.png" alt="Transformer" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Transformers</span>
                  </div>
                </Col>

                {/* Splitters */}
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/1_2_splitter_14.png" alt="1:2 Splitter" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">1:2 Splitter</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/1_4_splitter_13.png" alt="1:4 Splitter" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">1:4 Splitter</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/1_8_splitter_12.png" alt="1:8 Splitter" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">1:8 Splitter</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/1_16_splitter_11.png" alt="1:16 Splitter" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">1:16 Splitter</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/1_32_splitter_10.png" alt="1:32 Splitter" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">1:32 Splitter</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/128_Mains_splitters_16.png" alt="128 Main Splitter" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">128 Main Splitter</span>
                  </div>
                </Col>

                {/* Cables */}
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/24C_ADSS_6.png" alt="24C ADSS" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">24C ADSS</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/48C_ADSS_7.png" alt="48C ADSS" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">48C ADSS</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Existing_12_adss_8.png" alt="Existing 12C ADSS" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Existing 12C ADSS</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Proposed_adss_19.png" alt="Proposed ADSS" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Proposed ADSS</span>
                  </div>
                </Col>

                {/* Poles */}
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Tcom_27.png" alt="Tcom Pole" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Tcom Pole</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Prop_tcom_pole_2.png" alt="Proposed Tcom Pole" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Proposed Tcom Pole</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/kplc_29.png" alt="KPLC Pole" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">KPLC Pole</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/kplc_concrete_28.png" alt="KPLC Concrete" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">KPLC Concrete</span>
                  </div>
                </Col>

                {/* Buildings/Sites */}
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Building_26.png" alt="Building" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Building</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/BU_25.png" alt="BU" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">BU</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Sdu_24.png" alt="SDU" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">SDU</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/ATC_SITE_9.png" alt="ATC Site" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">ATC Site</span>
                  </div>
                </Col>

                {/* Other */}
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Proposed_FAT_4.png" alt="Proposed FAT" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Proposed FAT</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Proposed_Enclosure_3.png" alt="Proposed Enclosure" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Proposed Enclosure</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/Tcom_Mast_30.png" alt="Tcom Mast" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Tcom Mast</span>
                  </div>
                </Col>
                <Col xs="6" sm="4" md="3" lg="2">
                  <div className="d-flex align-items-center">
                    <img src="/images/legend/powerDrop_5.png" alt="Power Drop" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                    <span className="small">Power Drop</span>
                  </div>
                </Col>
              </Row>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default NetworkMap;
