import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Block, BlockHead, BlockTitle, BlockHeadContent, BlockBetween, Button, Icon } from "../../../components/Component";
import { Card, Badge, Spinner, Alert } from "reactstrap";

// Detect if in desktop mode on mobile (user agent spoofing)
// This is the problematic case - touch device pretending to be desktop
const isDesktopModeOnMobile = () => {
  // Check for touch support (indicates physical mobile device)
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Check if user agent looks like desktop (not mobile)
  const hasMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Desktop mode = has touch (physical mobile) BUT user agent is desktop-like
  // AND screen is smaller than typical desktop (rules out actual touch-screen laptops)
  const isSmallScreen = window.screen.width < 1200 || window.screen.height < 800;
  
  return hasTouch && !hasMobileUA && isSmallScreen;
};

function NetworkMapQGISIframe() {
  const navigate = useNavigate();
  const location = useLocation();
  const iframeRef = useRef(null);
  const [iframeSrc, setIframeSrc] = useState(null); // Start with null - don't load immediately
  const [targetItem, setTargetItem] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [userConfirmedLoad, setUserConfirmedLoad] = useState(false);

  // Check device type on mount
  useEffect(() => {
    const isDesktopOnMobile = isDesktopModeOnMobile();
    
    if (isDesktopOnMobile) {
      // Only show warning for desktop-mode-on-mobile (the problematic case)
      setShowMobileWarning(true);
    } else {
      // Normal mobile OR actual desktop - load immediately
      loadMap();
    }
  }, []);

  // Load map function
  const buildMapLiveSrc = useCallback((hashSuffix = '') => {
    const apiBase = (process.env.REACT_APP_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');
    return `/api/map-live.php?api=${encodeURIComponent(apiBase)}&v=${Date.now()}${hashSuffix}`;
  }, []);

  const loadMap = useCallback(() => {
    setIsLoading(true);
    setLoadError(false);
    setShowMobileWarning(false);
    
    let src = buildMapLiveSrc();
    
    if (location.state?.zoomToItem) {
      const item = location.state.zoomToItem;
      console.log('Map received item to zoom to:', item);
      setTargetItem(item);
      const { lat, lng } = item.coordinates;
      src = buildMapLiveSrc(`#${lat},${lng},18`);
    } else if (location.hash) {
      src = buildMapLiveSrc(location.hash);
    }
    
    // Set a timeout to detect if loading takes too long
    const loadTimeout = setTimeout(() => {
      if (isLoading) {
        console.log('Map loading timeout - may be having issues');
      }
    }, 15000);
    
    setIframeSrc(src);
    setUserConfirmedLoad(true);
    
    return () => clearTimeout(loadTimeout);
  }, [buildMapLiveSrc, location.state, location.hash, isLoading]);

  // Handle iframe load complete
  const handleIframeLoad = () => {
    try {
      const frameWindow = iframeRef.current && iframeRef.current.contentWindow;
      const frameDoc = iframeRef.current && iframeRef.current.contentDocument;
      const loadedReactShell = frameDoc && frameDoc.getElementById('root');
      const hasLiveMapApi = frameWindow && typeof frameWindow.reloadLiveData === 'function';

      if (loadedReactShell || !hasLiveMapApi) {
        setLoadError(true);
        setIsLoading(false);
        console.error('Map iframe loaded the app shell instead of the live map page');
        return;
      }
    } catch (e) {
      console.warn('Could not verify iframe map contents:', e);
    }

    setIsLoading(false);
    console.log('Map iframe loaded successfully');
  };

  // Handle iframe error
  const handleIframeError = () => {
    setIsLoading(false);
    setLoadError(true);
    console.error('Map iframe failed to load');
  };

  return (
    <React.Fragment>
      <Head title="Fiber Network Map (QGIS)" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Fiber Network Map</BlockTitle>
              {targetItem ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                  <Badge color="primary" style={{ fontSize: '13px', padding: '6px 12px' }}>
                    <Icon name="location" /> Viewing: {targetItem.name}
                  </Badge>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {targetItem.type} • {targetItem.coordinates.lat.toFixed(6)}, {targetItem.coordinates.lng.toFixed(6)}
                  </span>
                </div>
              ) : (
                <p>Live QGIS legend and colors — all layers from database. Import new features, then click Reload data.</p>
              )}
            </BlockHeadContent>
            <BlockHeadContent>
              {userConfirmedLoad && (
                <Button 
                  color="warning" 
                  className="me-2" 
                  onClick={() => {
                    if (iframeRef.current) {
                      setIsLoading(true);
                      try {
                        if (iframeRef.current.contentWindow && iframeRef.current.contentWindow.reloadLiveData) {
                          iframeRef.current.contentWindow.reloadLiveData().finally(function() {
                            setIsLoading(false);
                          });
                          return;
                        }
                      } catch (e) {
                        /* cross-origin fallback */
                      }
                      const hash = location.hash || (location.state?.zoomToItem
                        ? `#${location.state.zoomToItem.coordinates.lat},${location.state.zoomToItem.coordinates.lng},18`
                        : '');
                      iframeRef.current.src = buildMapLiveSrc(hash);
                    }
                  }}
                  disabled={isLoading}
                >
                  <Icon name="reload"></Icon>
                  <span className="ms-1">Reload data</span>
                </Button>
              )}
              <Button color="light" outline className="bg-white d-none d-sm-inline-flex" onClick={() => navigate(-1)}>
                <Icon name="arrow-left"></Icon>
                <span>Back</span>
              </Button>
              <Button color="light" outline className="bg-white d-inline-flex d-sm-none" onClick={() => navigate(-1)}>
                <Icon name="arrow-left"></Icon>
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        
        <Block>
          <Card className="card-bordered">
            <div style={{ position: 'relative', width: '100%', height: '85vh' }}>
              
              {/* Mobile Warning - Show before loading */}
              {showMobileWarning && !userConfirmedLoad && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: '40px',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa'
                }}>
                  <Icon name="alert-circle" style={{ fontSize: '48px', color: '#ff9800', marginBottom: '20px' }} />
                  <h4 style={{ marginBottom: '15px', color: '#333' }}>
                    Desktop Mode Detected
                  </h4>
                  <p style={{ color: '#666', marginBottom: '20px', maxWidth: '400px' }}>
                    You're viewing in "Request Desktop Site" mode. This map has ~2MB of data that may freeze your browser. 
                    <strong> Switch back to mobile view</strong> for better performance.
                  </p>
                  <Alert color="warning" className="mb-4" style={{ maxWidth: '400px' }}>
                    <strong>Tip:</strong> For better performance, try viewing this map on a desktop computer.
                  </Alert>
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button color="primary" size="lg" onClick={loadMap}>
                      <Icon name="map"></Icon>
                      <span className="ms-2">Load Map Anyway</span>
                    </Button>
                    <Button color="light" size="lg" onClick={() => navigate(-1)}>
                      <Icon name="arrow-left"></Icon>
                      <span className="ms-2">Go Back</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  zIndex: 10
                }}>
                  <Spinner color="primary" style={{ width: '3rem', height: '3rem' }} />
                  <p style={{ marginTop: '20px', color: '#666', fontSize: '16px' }}>
                    Loading map data...
                  </p>
                  <p style={{ color: '#999', fontSize: '14px' }}>
                    This may take a moment on slower connections
                  </p>
                </div>
              )}

              {/* Load Error */}
              {loadError && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: '40px',
                  textAlign: 'center'
                }}>
                  <Icon name="cross-circle" style={{ fontSize: '48px', color: '#dc3545', marginBottom: '20px' }} />
                  <h4 style={{ marginBottom: '15px', color: '#333' }}>
                    Failed to Load Map
                  </h4>
                  <p style={{ color: '#666', marginBottom: '20px' }}>
                    The map page could not be loaded. Deploy the latest <code>api/map-live.php</code> files, then try again.
                  </p>
                  <Button color="primary" onClick={loadMap}>
                    <Icon name="reload"></Icon>
                    <span className="ms-2">Try Again</span>
                  </Button>
                </div>
              )}

              {/* The actual iframe - only render when user confirmed and src is set */}
              {iframeSrc && userConfirmedLoad && (
                <iframe
                  ref={iframeRef}
                  key={iframeSrc}
                  src={iframeSrc}
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    opacity: isLoading ? 0 : 1,
                    transition: 'opacity 0.3s ease'
                  }}
                  title="QGIS Fiber Network Map"
                />
              )}
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
}

export default NetworkMapQGISIframe;
