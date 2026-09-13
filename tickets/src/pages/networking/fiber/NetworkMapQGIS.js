import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './NetworkMap.css';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Block, BlockHead, BlockTitle, BlockHeadContent, BlockBetween, Button } from "../../../components/Component";
import { Card, Spinner } from "reactstrap";

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// QGIS-exported cable layer configurations with exact colors from QGIS
const cableLayerConfigs = {
  // Updated layers from TComm folder
  '24C_ADSS': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/24C_ADSS.js',
    variable: 'json_24C_ADSS',
    color: '#ff9600', // Orange
    weight: 5,
    opacity: 1.0,
    label: '24C ADSS'
  },
  '48C_ADSS': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/48C_ADSS.js',
    variable: 'json_48C_ADSS',
    color: '#1abf1a', // Green
    weight: 6,
    opacity: 1.0,
    label: '48C ADSS'
  },
  'Existing_12_adss': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Existing_12_adss.js',
    variable: 'json_Existing_12_adss',
    color: '#1f78b4', // Blue
    weight: 4,
    opacity: 1.0,
    label: 'Existing 12C ADSS'
  },
  'proposed_adss': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/proposed_adss.js',
    variable: 'json_proposed_adss',
    color: '#969696', // Gray
    weight: 4,
    opacity: 1.0,
    dashArray: '8, 6',
    label: 'Proposed ADSS'
  },
  'powerDrop': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/powerDrop.js',
    variable: 'json_powerDrop',
    color: '#e31a1c', // Red
    weight: 4,
    opacity: 1.0,
    label: 'Power Drop'
  },
  // Closures
  '12C_closure': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/12C_closure.js',
    variable: 'json_12C_closure',
    color: '#ff7f00',
    weight: 1,
    radius: 6,
    opacity: 1.0,
    label: '12C Closure',
    type: 'point'
  },
  '48_closure': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/48_closure.js',
    variable: 'json_48_closure',
    color: '#984ea3',
    weight: 1,
    radius: 7,
    opacity: 1.0,
    label: '48C Closure',
    type: 'point'
  },
  '96C_Closure': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/96C_Closure.js',
    variable: 'json_96C_Closure',
    color: '#e41a1c',
    weight: 1,
    radius: 8,
    opacity: 1.0,
    label: '96C Closure',
    type: 'point'
  },
  'Existing_Closure': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Existing_Closure.js',
    variable: 'json_Existing_Closure',
    color: '#377eb8',
    weight: 1,
    radius: 6,
    opacity: 1.0,
    label: 'Existing Closure',
    type: 'point'
  },
  'Proposed_Enclosure': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Proposed_Enclosure.js',
    variable: 'json_Proposed_Enclosure',
    color: '#999999',
    weight: 1,
    radius: 6,
    opacity: 0.7,
    label: 'Proposed Enclosure',
    type: 'point'
  },
  // Splitters
  '1_2_splitter': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/1_2_splitter.js',
    variable: 'json_1_2_splitter',
    color: '#e31a1c',
    weight: 1,
    radius: 4,
    opacity: 1.0,
    label: '1:2 Splitter',
    type: 'point'
  },
  '1_4_splitter': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/1_4_splitter.js',
    variable: 'json_1_4_splitter',
    color: '#ff7f00',
    weight: 1,
    radius: 5,
    opacity: 1.0,
    label: '1:4 Splitter',
    type: 'point'
  },
  '1_8_splitter': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/1_8_splitter.js',
    variable: 'json_1_8_splitter',
    color: '#ffd700',
    weight: 1,
    radius: 5,
    opacity: 1.0,
    label: '1:8 Splitter',
    type: 'point'
  },
  '1_16_splitter': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/1_16_splitter.js',
    variable: 'json_1_16_splitter',
    color: '#4daf4a',
    weight: 1,
    radius: 6,
    opacity: 1.0,
    label: '1:16 Splitter',
    type: 'point'
  },
  '1_32_splitter': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/1_32_splitter.js',
    variable: 'json_1_32_splitter',
    color: '#377eb8',
    weight: 1,
    radius: 6,
    opacity: 1.0,
    label: '1:32 Splitter',
    type: 'point'
  },
  'Main_Splitters_128_64_': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Main_Splitters_128_64_.js',
    variable: 'json_Main_Splitters_128_64_',
    color: '#984ea3',
    weight: 1,
    radius: 8,
    opacity: 1.0,
    label: 'Main Splitters (128/64)',
    type: 'point'
  },
  // Infrastructure
  'FAT': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/FAT.js',
    variable: 'json_FAT',
    color: '#ffff33',
    weight: 1,
    radius: 6,
    opacity: 1.0,
    label: 'FAT',
    type: 'point'
  },
  'Proposed_FAT': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Proposed_FAT.js',
    variable: 'json_Proposed_FAT',
    color: '#cccc00',
    weight: 1,
    radius: 6,
    opacity: 0.7,
    label: 'Proposed FAT',
    type: 'point'
  },
  'BU': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/BU.js',
    variable: 'json_BU',
    color: '#a65628',
    weight: 1,
    radius: 5,
    opacity: 1.0,
    label: 'BU',
    type: 'point'
  },
  'sdu': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/sdu.js',
    variable: 'json_sdu',
    color: '#f781bf',
    weight: 1,
    radius: 5,
    opacity: 1.0,
    label: 'SDU',
    type: 'point'
  },
  'Uc': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Uc.js',
    variable: 'json_Uc',
    color: '#999999',
    weight: 1,
    radius: 5,
    opacity: 1.0,
    label: 'UC',
    type: 'point'
  },
  // Poles & Infrastructure
  'prop_tcom_pole': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/prop_tcom_pole.js',
    variable: 'json_prop_tcom_pole',
    color: '#666666',
    weight: 1,
    radius: 4,
    opacity: 0.7,
    label: 'Proposed TCom Pole',
    type: 'point'
  },
  'tcom_': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/tcom_.js',
    variable: 'json_tcom_',
    color: '#1f78b4',
    weight: 1,
    radius: 4,
    opacity: 1.0,
    label: 'TCom Pole',
    type: 'point'
  },
  'Tcom_Mast': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Tcom_Mast.js',
    variable: 'json_Tcom_Mast',
    color: '#33a02c',
    weight: 1,
    radius: 7,
    opacity: 1.0,
    label: 'TCom Mast',
    type: 'point'
  },
  'kplc': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/kplc.js',
    variable: 'json_kplc',
    color: '#ff0000',
    weight: 1,
    radius: 4,
    opacity: 1.0,
    label: 'KPLC Pole',
    type: 'point'
  },
  'kplc_concrete': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/kplc_concrete.js',
    variable: 'json_kplc_concrete',
    color: '#8b0000',
    weight: 1,
    radius: 5,
    opacity: 1.0,
    label: 'KPLC Concrete Pole',
    type: 'point'
  },
  'Transformer': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/Transformer.js',
    variable: 'json_Transformer',
    color: '#ff4500',
    weight: 1,
    radius: 6,
    opacity: 1.0,
    label: 'Transformer',
    type: 'point'
  },
  'building': {
    file: '/qgis2web_2025_09_22-15_58_48_034179/layers/building.js',
    variable: 'json_building',
    color: '#8b4513',
    weight: 2,
    opacity: 0.6,
    fillOpacity: 0.3,
    label: 'Building',
    type: 'polygon'
  }
};

const NetworkMapQGIS = function() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedLayers, setLoadedLayers] = useState([]);

  useEffect(function() {
    if (!mapContainerRef.current || mapRef.current) return;

    console.log('Initializing map...');
    
    // Create map
    const map = L.map(mapContainerRef.current, {
      center: [-0.255, 36.115],
      zoom: 13,
      scrollWheelZoom: true
    });

    mapRef.current = map;

    // Add satellite tile layer
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google',
      maxZoom: 20
    }).addTo(map);

    console.log('Map initialized, loading cable layers...');
    
    // Load all cable layers
    loadAllCableLayers(map);

    return function() {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const loadAllCableLayers = function(map) {
    const layerPromises = Object.keys(cableLayerConfigs).map(function(layerId) {
      return loadCableLayer(layerId, map);
    });

    Promise.all(layerPromises)
      .then(function(results) {
        console.log('All cable layers loaded:', results.filter(r => r.success).length, 'successful');
        setLoadedLayers(results.filter(r => r.success).map(r => r.layerId));
        setLoading(false);
        
        // Fit map to all cable bounds
        const allBounds = [];
        Object.values(layersRef.current).forEach(function(layer) {
          if (layer && layer.getBounds) {
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
              allBounds.push(bounds);
            }
          }
        });
        
        if (allBounds.length > 0 && map) {
          const combinedBounds = allBounds.reduce(function(acc, bounds) {
            return acc.extend(bounds);
          }, allBounds[0]);
          
          map.fitBounds(combinedBounds, { padding: [50, 50] });
          console.log('Map fitted to cable bounds');
        }
      })
      .catch(function(err) {
        console.error('Error loading cable layers:', err);
        setError('Failed to load some cable layers: ' + err.message);
        setLoading(false);
      });
  };

  const loadCableLayer = function(layerId, map) {
    return new Promise(function(resolve) {
      const config = cableLayerConfigs[layerId];
      if (!config) {
        resolve({ success: false, layerId: layerId, error: 'No config found' });
        return;
      }

      console.log('Loading layer:', config.label, 'from', config.file);

      // Create a script tag to load the QGIS JS file
      const script = document.createElement('script');
      script.src = config.file;
      script.async = true;
      
      script.onload = function() {
        try {
          // Access the global variable created by the QGIS JS file
          const geoJsonData = window[config.variable];
          
          if (!geoJsonData) {
            console.error('Variable not found:', config.variable);
            resolve({ success: false, layerId: layerId, error: 'Data variable not found' });
            return;
          }

          console.log('Loaded', config.label, ':', geoJsonData.features.length, 'features');

          // Create GeoJSON layer with correct styling based on geometry type
          const layer = L.geoJSON(geoJsonData, {
            style: function(feature) {
              if (config.type === 'polygon') {
                return {
                  color: config.color,
                  weight: config.weight,
                  opacity: config.opacity,
                  fillColor: config.color,
                  fillOpacity: config.fillOpacity || 0.3
                };
              }
              return {
                color: config.color,
                weight: config.weight,
                opacity: config.opacity,
                dashArray: config.dashArray || null
              };
            },
            pointToLayer: function(feature, latlng) {
              if (config.type === 'point') {
                return L.circleMarker(latlng, {
                  radius: config.radius || 6,
                  fillColor: config.color,
                  color: '#000',
                  weight: config.weight || 1,
                  opacity: 1,
                  fillOpacity: config.opacity || 0.8
                });
              }
              return L.marker(latlng);
            },
            onEachFeature: function(feature, layer) {
              if (feature.properties) {
                const props = feature.properties;
                let popupContent = '<div style="font-weight: bold; color: ' + config.color + '">' + 
                  config.label + '</div>';
                
                // Add all properties in a readable format
                Object.keys(props).forEach(key => {
                  if (props[key] && key !== 'id' && key !== 'fid') {
                    const value = props[key];
                    if (typeof value === 'string' || typeof value === 'number') {
                      popupContent += '<div style="font-size: 11px; margin-top: 2px">' +
                        '<span style="font-weight: 500">' + key + ':</span> ' + value + '</div>';
                    }
                  }
                });
                
                layer.bindPopup(popupContent);
              }
            }
          });

          layer.addTo(map);
          layersRef.current[layerId] = layer;

          console.log(config.label, 'added to map successfully');
          resolve({ success: true, layerId: layerId, count: geoJsonData.features.length });
          
        } catch (error) {
          console.error('Error processing layer:', config.label, error);
          resolve({ success: false, layerId: layerId, error: error.message });
        }
      };

      script.onerror = function() {
        console.error('Failed to load script:', config.file);
        resolve({ success: false, layerId: layerId, error: 'Script load failed' });
      };

      document.head.appendChild(script);
    });
  };

  const toggleLayer = function(layerId) {
    const layer = layersRef.current[layerId];
    const map = mapRef.current;
    
    if (!layer || !map) return;

    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
      setLoadedLayers(loadedLayers.filter(id => id !== layerId));
    } else {
      layer.addTo(map);
      setLoadedLayers([...loadedLayers, layerId]);
    }
  };

  return (
    <React.Fragment>
      <Head title="Fiber Network Map (QGIS)" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Fiber Structure - Network Infrastructure Map
              </BlockTitle>
              <p className="text-soft">Interactive map showing all fiber network infrastructure from QGIS</p>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              {error && (
                <div className="alert alert-warning" role="alert">
                  <strong>Warning:</strong> {error}
                </div>
              )}
              
              {loading && (
                <div className="text-center py-3">
                  <Spinner color="primary" />
                  <p className="mt-2">Loading network infrastructure...</p>
                </div>
              )}

              {/* Layer Controls */}
              <div className="mb-3 d-flex flex-wrap gap-2">
                {Object.keys(cableLayerConfigs).map(function(layerId) {
                  const config = cableLayerConfigs[layerId];
                  const isActive = loadedLayers.includes(layerId);
                  
                  return (
                    <Button
                      key={layerId}
                      size="sm"
                      color={isActive ? "primary" : "light"}
                      outline={!isActive}
                      onClick={() => toggleLayer(layerId)}
                      disabled={loading}
                    >
                      <span 
                        style={{
                          display: 'inline-block',
                          width: '12px',
                          height: '3px',
                          backgroundColor: config.color,
                          marginRight: '6px',
                          verticalAlign: 'middle'
                        }}
                      />
                      {config.label}
                    </Button>
                  );
                })}
              </div>

              {/* Map Container */}
              <div 
                ref={mapContainerRef} 
                style={{ 
                  width: '100%', 
                  height: '80vh', 
                  minHeight: '600px',
                  borderRadius: '4px',
                  border: '1px solid #dbdfea'
                }}
              />
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default NetworkMapQGIS;
