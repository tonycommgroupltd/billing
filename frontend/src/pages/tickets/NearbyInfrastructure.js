import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, ModalBody, Button, Spinner } from 'reactstrap';
import Icon from '../../components/icon/Icon';
import { showError, showSuccess } from '../../utils/notifications';
import { ticketsHttp } from '../../helpers/ticketsHttp';
import { ensureTicketsAuth } from '../../helpers/ticketsAuth';

const NearbyInfrastructure = ({ isOpen, toggle, setSplittersUpdated, user }) => {
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState(null);
  const [selectedType, setSelectedType] = useState('all');
  const [nearbyItems, setNearbyItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  
  // Splitter update state
  const [editingItem, setEditingItem] = useState(null);
  const [editCounts, setEditCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [fatList, setFatList] = useState([]);
  const [closureList, setClosureList] = useState([]);

  const infrastructureTypes = [
    { value: 'all', label: 'All Infrastructure', icon: 'layers' },
    { value: 'FAT', label: 'FAT (Fiber Access Terminal)', icon: 'server' },
    { value: 'pole', label: 'Poles', icon: 'flag' },
    { value: 'closure', label: 'Closures', icon: 'box' },
    { value: 'splitter', label: 'Splitters', icon: 'share' },
    { value: 'cable_24c', label: '24C ADSS Cable', icon: 'minus' },
    { value: 'cable_48c', label: '48C ADSS Cable', icon: 'minus' },
    { value: 'cable_12c', label: '12C ADSS Cable', icon: 'minus' },
    { value: 'hub', label: 'Hubs', icon: 'grid' }
  ];

  // Load FAT and Closure lists when modal opens
  useEffect(() => {
    if (isOpen) {
      loadFiberStructureLists();
    }
  }, [isOpen]);

  const loadFiberStructureLists = async () => {
    try {
      await ensureTicketsAuth();
      const [fatResponse, closureResponse] = await Promise.all([
        ticketsHttp.get('/network-map.php?type=fat'),
        ticketsHttp.get('/network-map.php?type=closures'),
      ]);

      const fatResult = fatResponse.data;
      const closureResult = closureResponse.data;

      if (fatResult.success) setFatList(fatResult.fat || []);
      if (closureResult.success) setClosureList(closureResult.closures || []);
    } catch (err) {
      console.error('Error loading fiber structure lists:', err);
    }
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance; // in kilometers
  };

  // Find matching FAT/Closure from DB by coordinates/name
  const findMatchingItem = (item) => {
    const list = item.type === 'FAT' ? fatList : closureList;
    // Try to match by FID or description
    return list.find(dbItem => 
      (item.properties.FID && dbItem.fid === item.properties.FID) ||
      (item.name && dbItem.description && dbItem.description.includes(item.name))
    );
  };

  // Start editing splitter counts
  const startEditing = (item) => {
    const dbItem = findMatchingItem(item);
    
    if (dbItem) {
      setEditingItem({ ...item, dbId: dbItem.id });
      setEditCounts({
        '1_2': dbItem.splitter_1_2_count || 0,
        '1_4': dbItem.splitter_1_4_count || 0,
        '1_8': dbItem.splitter_1_8_count || 0,
        '1_16': dbItem.splitter_1_16_count || 0,
        '1_32': dbItem.splitter_1_32_count || 0
      });
    } else {
      showError(`Could not find matching ${item.type} in database`);
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingItem(null);
    setEditCounts({});
  };

  // Update count
  const updateCount = (splitterType, value) => {
    const numValue = parseInt(value) || 0;
    setEditCounts(prev => ({
      ...prev,
      [splitterType]: numValue >= 0 ? numValue : 0
    }));
  };

  // Save splitter counts
  const saveSplitterCounts = async () => {
    if (!editingItem || !editingItem.dbId) return;

    try {
      setSaving(true);
      await ensureTicketsAuth();

      const response = await ticketsHttp.post('/network-map.php/update-splitter-counts', {
        targetType: editingItem.type === 'FAT' ? 'fat' : 'closure',
        id: editingItem.dbId,
        counts: editCounts,
        updatedBy: user?.name || user?.email || 'Unknown User',
      });

      const result = response.data;
      
      if (result.success) {
        showSuccess('Splitter counts updated successfully!');
        setEditingItem(null);
        setEditCounts({});
        // Mark splitters as updated in parent component
        if (setSplittersUpdated) {
          setSplittersUpdated(true);
        }
        // Reload lists to get updated data
        await loadFiberStructureLists();
      } else {
        throw new Error(result.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error saving:', err);
      showError('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Get user's current location
  const getUserLocation = () => {
    setLoadingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          setLoadingLocation(false);
          showSuccess('Location detected successfully');
          loadNearbyInfrastructure(location, selectedType);
        },
        (error) => {
          setLoadingLocation(false);
          showError(`Location error: ${error.message}`);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLoadingLocation(false);
      showError('Geolocation is not supported by this browser');
    }
  };

  // Load QGIS data and filter nearby items
  const loadNearbyInfrastructure = async (location, type) => {
    if (!location) return;
    
    setLoading(true);
    try {
      // Load all QGIS layer data
      const layerData = await loadQGISLayers();
      
      // Calculate distances and filter by type
      let allItems = [];
      
      Object.keys(layerData).forEach(layerName => {
        const features = layerData[layerName];
        features.forEach(feature => {
          const coords = getFeatureCoordinates(feature);
          if (coords) {
            const distance = calculateDistance(
              location.lat,
              location.lng,
              coords.lat,
              coords.lng
            );
            
            allItems.push({
              type: getInfrastructureType(layerName),
              name: feature.properties.description || feature.properties.FID || 'Unnamed',
              distance: distance,
              coordinates: coords,
              layerName: layerName,
              properties: feature.properties
            });
          }
        });
      });

      // Filter by selected type
      if (type !== 'all') {
        allItems = allItems.filter(item => item.type === type);
      }

      // Sort by distance
      allItems.sort((a, b) => a.distance - b.distance);

      // Take only nearest 20 items
      setNearbyItems(allItems.slice(0, 20));
      setLoading(false);
      
    } catch (error) {
      console.error('Error loading infrastructure:', error);
      showError('Failed to load infrastructure data');
      setLoading(false);
    }
  };

  // Load QGIS layer files
  const loadQGISLayers = async () => {
    const layers = {
      'FAT_18': [],
      'Tcom_27': [],
      'kplc_29': [],
      'Closure_22': [],
      '1_32_splitter_10': [],
      '1_16_splitter_11': [],
      '1_8_splitter_12': [],
      '24C_ADSS_6': [],
      '48C_ADSS_7': [],
      'Existing_12_adss_8': [],
      'HUBS_20': []
    };

    // In a real implementation, you'd load these from the actual QGIS files
    // For now, we'll create a simplified loader
    for (const layerName of Object.keys(layers)) {
      try {
        const response = await fetch(`/qgis2web_2025_09_22-15_58_48_034179/layers/${layerName}.js`);
        const text = await response.text();
        
        // Extract JSON from the JavaScript file
        const match = text.match(/var\s+json_\w+\s*=\s*({[\s\S]*})/);
        if (match) {
          const data = JSON.parse(match[1]);
          layers[layerName] = data.features || [];
        }
      } catch (error) {
        console.warn(`Could not load layer ${layerName}:`, error);
      }
    }

    return layers;
  };

  // Get coordinates from feature
  const getFeatureCoordinates = (feature) => {
    if (!feature.geometry) return null;
    
    const coords = feature.geometry.coordinates;
    if (!coords) return null;

    // Handle different geometry types
    if (feature.geometry.type === 'Point') {
      return { lng: coords[0], lat: coords[1] };
    } else if (feature.geometry.type === 'LineString') {
      // Use midpoint of line
      const midIndex = Math.floor(coords.length / 2);
      return { lng: coords[midIndex][0], lat: coords[midIndex][1] };
    }
    
    return null;
  };

  // Determine infrastructure type from layer name
  const getInfrastructureType = (layerName) => {
    if (layerName.includes('FAT')) return 'FAT';
    if (layerName.includes('Tcom') || layerName.includes('kplc')) return 'pole';
    if (layerName.includes('Closure')) return 'closure';
    if (layerName.includes('splitter')) return 'splitter';
    if (layerName.includes('24C')) return 'cable_24c';
    if (layerName.includes('48C')) return 'cable_48c';
    if (layerName.includes('12')) return 'cable_12c';
    if (layerName.includes('HUB')) return 'hub';
    return 'other';
  };

  // Navigate to location
  const navigateToLocation = (item) => {
    const { lat, lng } = item.coordinates;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  // View on map
  const viewOnMap = (item) => {
    console.log('View on map clicked:', item);
    // Close the modal and navigate to map with item data
    toggle();
    console.log('Navigating to map with coordinates:', item.coordinates);
    navigate('/admin/networking/fiber/map-qgis', {
      state: {
        zoomToItem: {
          layerName: item.layerName,
          coordinates: item.coordinates,
          name: item.name,
          type: item.type,
          properties: item.properties
        }
      }
    });
  };

  useEffect(() => {
    if (isOpen && !userLocation) {
      getUserLocation();
    }
  }, [isOpen]);

  useEffect(() => {
    if (userLocation) {
      loadNearbyInfrastructure(userLocation, selectedType);
    }
  }, [selectedType]);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg" style={{ maxWidth: '900px' }}>
      <div className="modal-header">
        <h5 className="modal-title">Nearby Fiber Infrastructure</h5>
        <button type="button" className="close" onClick={toggle}>
          <Icon name="cross" />
        </button>
      </div>
      <ModalBody>
        <div style={{ marginBottom: '20px' }}>
          {/* Location Status */}
          <div style={{ 
            padding: '12px', 
            background: userLocation ? '#d1fae5' : '#fee2e2',
            borderRadius: '6px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Icon name={userLocation ? 'check-circle' : 'alert-circle'} 
                  style={{ fontSize: '20px', color: userLocation ? '#059669' : '#dc2626' }} />
            <div style={{ flex: 1 }}>
              {loadingLocation ? (
                <span>Detecting your location...</span>
              ) : userLocation ? (
                <span>
                  Your location: <strong>{userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</strong>
                </span>
              ) : (
                <span>Location not detected</span>
              )}
            </div>
            {!loadingLocation && (
              <Button color="primary" size="sm" onClick={getUserLocation}>
                <Icon name="location" /> Refresh Location
              </Button>
            )}
          </div>

          {/* Infrastructure Type Filter */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {infrastructureTypes.map(type => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: selectedType === type.value ? '2px solid #357bf2' : '1px solid #e5e7eb',
                  background: selectedType === type.value ? '#eff6ff' : 'white',
                  color: selectedType === type.value ? '#357bf2' : '#374151',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Icon name={type.icon} />
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div style={{ 
          maxHeight: '500px', 
          overflowY: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '6px'
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Spinner color="primary" />
              <div style={{ marginTop: '10px' }}>Loading infrastructure...</div>
            </div>
          ) : nearbyItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              <Icon name="info" style={{ fontSize: '40px', marginBottom: '10px' }} />
              <div>No infrastructure found nearby</div>
            </div>
          ) : (
            <div>
              {nearbyItems.map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    borderBottom: index < nearbyItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Icon name={infrastructureTypes.find(t => t.value === item.type)?.icon || 'layers'} 
                          style={{ color: '#357bf2', fontSize: '18px' }} />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      <span style={{ 
                        background: '#f3f4f6', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        marginRight: '8px'
                      }}>
                        {infrastructureTypes.find(t => t.value === item.type)?.label || item.type}
                      </span>
                      <strong>{item.distance < 1 
                        ? `${(item.distance * 1000).toFixed(0)}m` 
                        : `${item.distance.toFixed(2)}km`}</strong> away
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {(item.type === 'FAT' || item.type === 'closure') && (
                      <button
                        onClick={() => startEditing(item)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid #10b981',
                          background: '#10b981',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        title="Update splitter counts"
                      >
                        <Icon name="edit" />
                        Update
                      </button>
                    )}
                    <button
                      onClick={() => navigateToLocation(item)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #357bf2',
                        background: '#357bf2',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      title="Navigate to this location"
                    >
                      <Icon name="navigation" />
                      Navigate
                    </button>
                    <button
                      onClick={() => viewOnMap(item)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #6b7280',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      title="View on map"
                    >
                      <Icon name="map-pin" />
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editing Panel */}
        {editingItem && (
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'white',
            borderTop: '2px solid #357bf2',
            padding: '20px',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
            zIndex: 10000
          }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h6 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="edit" style={{ color: '#10b981' }} />
                  Update Splitter Counts - {editingItem.name}
                </h6>
                <button
                  onClick={cancelEditing}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontSize: '20px',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                {['1_2', '1_4', '1_8', '1_16', '1_32'].map(type => (
                  <div key={type}>
                    <label style={{ 
                      fontSize: '12px', 
                      fontWeight: '600',
                      display: 'block', 
                      marginBottom: '6px',
                      textAlign: 'center'
                    }}>
                      {type.replace('_', ':')} Splitter
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editCounts[type]}
                      onChange={(e) => updateCount(type, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        textAlign: 'center',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        fontWeight: '600'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Last Update Information */}
              {(editingItem.splitters_updated_at || editingItem.splitters_updated_by) && (
                <div style={{
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #e9ecef',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: '#6b7280'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>Last Update:</div>
                  <div>
                    {editingItem.splitters_updated_at && (
                      <span>
                        📅 {new Date(editingItem.splitters_updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                    {editingItem.splitters_updated_by && (
                      <span style={{ marginLeft: '12px' }}>
                        👤 {editingItem.splitters_updated_by}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  Total: <strong style={{ fontSize: '18px', color: '#357bf2' }}>
                    {Object.values(editCounts).reduce((sum, val) => sum + val, 0)}
                  </strong> splitters
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={cancelEditing}
                    disabled={saving}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      background: 'white',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSplitterCounts}
                    disabled={saving}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '6px',
                      border: '1px solid #10b981',
                      background: '#10b981',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {saving ? (
                      <>
                        <Spinner size="sm" color="light" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Icon name="check" />
                        Update Splitters
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
};

export default NearbyInfrastructure;
