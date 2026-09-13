import React, { useState } from 'react';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Block, BlockHead, BlockTitle, BlockHeadContent, BlockBetween, Button, Icon } from "../../../components/Component";
import { Card, Alert, Spinner, Progress, Badge } from "reactstrap";

function ImportGeojsonAndMap() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);
  const [mapLayersResult, setMapLayersResult] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const slugLayerKey = (filename) => {
    const base = filename.replace(/\.geojson$/i, '');
    const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return key || 'custom_layer';
  };

  // Map filenames to layer types
  const getLayerType = (filename) => {
    const lower = filename.toLowerCase();
    
    if (lower.includes('fat')) return { type: 'fat', label: 'FAT Points' };
    if (lower.includes('closure') || lower.includes('enclosure')) return { type: 'closure', label: 'Closures' };
    if (lower.includes('splitter')) {
      const match = filename.match(/1_(\d+)/);
      if (match) {
        return { type: 'splitter', label: `1:${match[1]} Splitters`, splitterType: `1:${match[1]}` };
      }
      return { type: 'splitter', label: 'Splitters' };
    }
    if (lower.includes('power') && lower.includes('drop')) return { type: 'cable', label: 'Power Drop', cableHint: 'powerDrop' };
    if (lower.includes('proposed') && lower.includes('adss')) return { type: 'cable', label: 'Proposed ADSS', cableHint: 'proposed_adss' };
    if (lower.includes('12') && lower.includes('adss')) return { type: 'cable', label: '12C Existing ADSS', cableHint: '12c_existing_adss' };
    if (lower.includes('48') && lower.includes('adss')) return { type: 'cable', label: '48C ADSS', cableHint: '48c_adss' };
    if (lower.includes('24') && lower.includes('adss')) return { type: 'cable', label: '24C ADSS', cableHint: '24c_adss' };
    if (lower.includes('cable') || lower.includes('adss')) return { type: 'cable', label: 'ADSS Cables', cableHint: '24c_adss' };
    if (lower.includes('pole') || lower.includes('tcom') || lower.includes('kplc')) return { type: 'pole', label: 'Poles' };
    if (lower.includes('transformer')) return { type: 'transformer', label: 'Transformers' };
    if (lower.includes('building')) return { type: 'building', label: 'Buildings' };
    if (lower.includes('hub')) return { type: 'hub', label: 'Hubs' };

    const baseName = filename.replace(/\.geojson$/i, '');
    return {
      type: 'custom',
      label: `${baseName} (custom layer)`,
      layerKey: slugLayerKey(filename),
      layerTitle: baseName,
    };
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    const geojsonFiles = files.filter(f => f.name.endsWith('.geojson'));
    
    if (geojsonFiles.length === 0) {
      setError('Please select GeoJSON files');
      return;
    }

    setError(null);
    setUploadedFiles(geojsonFiles);
  };

  const handleImport = async () => {
    if (uploadedFiles.length === 0) {
      setError('No files selected');
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);
    setImportProgress(0);
    const results = {};
    let lastMapLayers = null;
    let lastMapUpdated = null;

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '/api';

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const layerInfo = getLayerType(file.name);
        
        setImportProgress(Math.round((i / uploadedFiles.length) * 100));

        // Read file
        const fileContent = await file.text();
        const geojson = JSON.parse(fileContent);

        if (!geojson.features) {
          results[file.name] = { success: false, error: 'Invalid GeoJSON format' };
          continue;
        }

        // Prepare import data
        const importData = {
          layer: layerInfo.type,
          features: geojson.features,
          sourceFile: file.name,
          ...(layerInfo.splitterType && { splitterType: layerInfo.splitterType }),
          ...(layerInfo.cableHint && { cableHint: layerInfo.cableHint }),
          ...(layerInfo.layerKey && { layerKey: layerInfo.layerKey }),
          ...(layerInfo.layerTitle && { layerTitle: layerInfo.layerTitle }),
        };

        // Import to API
        const response = await fetch(`${apiUrl}/network-map.php/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(importData)
        });

        const result = await response.json();
        lastMapLayers = result.mapLayers || lastMapLayers;
        if (result.mapUpdated !== undefined) {
          lastMapUpdated = result.mapUpdated;
        }
        results[file.name] = {
          success: result.success,
          count: result.count || 0,
          layer: layerInfo.label,
          error: result.error,
          mapUpdated: result.mapUpdated,
          mapLayers: result.mapLayers,
        };
      }

      setImportProgress(100);
      setImportResults(results);
      setMapLayersResult(lastMapLayers);

      const allSuccess = Object.values(results).every(r => r.success);
      if (allSuccess && lastMapUpdated !== false) {
        setSuccess(`Imported ${uploadedFiles.length} file(s) to the database. Open Network Map and click Reload data.`);
      } else if (allSuccess && lastMapUpdated === false) {
        setSuccess(`Imported ${uploadedFiles.length} file(s) to the database. Open Network Map and click Reload data. (QGIS static files were not updated — use Regenerate only if you use /map-qgis.)`);
      } else {
        setError('Some files failed to import. Check results below.');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(`Import failed: ${err.message}`);
      setImporting(false);
    }

    setImporting(false);
  };

  const handleRegenerateMap = async () => {
    setRegenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiUrl}/network-map.php/regenerate-map`, { method: 'POST' });
      const result = await response.json();
      setMapLayersResult(result.mapLayers || null);
      if (result.success && result.mapLayers?.success) {
        setSuccess(`QGIS static files updated — ${(result.mapLayers.generated || []).length} layer file(s). Open /map-qgis and hard-refresh if you use that view.`);
      } else {
        setError(result.mapLayers?.error || result.error || 'Map regeneration failed');
      }
    } catch (err) {
      setError(`Regenerate failed: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleClear = () => {
    setUploadedFiles([]);
    setImportResults(null);
    setError(null);
    setSuccess(null);
    setImportProgress(0);
    setMapLayersResult(null);
  };

  return (
    <React.Fragment>
      <Head title="Import GeoJSON & Update Map" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Import GeoJSON & Update Map</BlockTitle>
              <p className="text-soft">Import GeoJSON into the database. The main Network Map updates after you click Reload data — no redeploy.</p>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {error && <Alert color="danger">{error}</Alert>}
        {success && <Alert color="success">{success}</Alert>}

        {/* Instructions Card */}
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <h6 className="mb-3">
                <Icon name="info" className="text-info me-2" />
                How It Works
              </h6>
              <ol className="ps-3 text-soft">
                <li>Select GeoJSON files from your TComm folder (you can select multiple files)</li>
                <li>Files are automatically matched to layers (FAT, Closures, Splitters, Cables, Poles, etc.)</li>
                <li>Click &quot;Import&quot; — data is saved to the database</li>
                <li>Open <strong>Network Map</strong> and click <strong>Reload data</strong> — no redeploy required</li>
                <li><strong>Splitter counts</strong> in FAT/Closure lists are never overwritten by import</li>
              </ol>
              <p className="text-soft small mb-0 mt-2">
                The main map reads live from the API. &quot;Regenerate Map Files&quot; is only needed for the legacy QGIS static view (<code>/map-qgis</code>).
              </p>
            </div>
          </Card>
        </Block>

        {/* File Upload Section */}
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <h6 className="mb-4">
                <Icon name="upload" className="me-2" />
                Select GeoJSON Files
              </h6>

              <div className="mb-4">
                <input
                  type="file"
                  multiple
                  accept=".geojson"
                  onChange={handleFileSelect}
                  disabled={importing}
                  style={{
                    display: 'block',
                    padding: '20px',
                    border: '2px dashed #ccc',
                    borderRadius: '4px',
                    textAlign: 'center',
                    cursor: importing ? 'not-allowed' : 'pointer',
                    opacity: importing ? 0.6 : 1
                  }}
                />
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mb-4">
                  <h6 className="mb-3">Selected Files ({uploadedFiles.length})</h6>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {uploadedFiles.map((file, idx) => {
                      const layerInfo = getLayerType(file.name);
                      return (
                        <div key={idx} className="d-flex justify-content-between align-items-center p-2 border-bottom">
                          <div>
                            <Icon name="file" className="me-2" />
                            <strong>{file.name}</strong>
                            <div className="small text-soft">{(file.size / 1024).toFixed(2)} KB</div>
                          </div>
                          <Badge color={layerInfo.type === 'custom' ? 'info' : 'primary'}>{layerInfo.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {importing && (
                <div className="mb-4">
                  <div className="d-flex justify-content-between mb-2">
                    <span>Importing...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                </div>
              )}

              <div className="d-flex gap-2">
                <Button
                  color="primary"
                  onClick={handleImport}
                  disabled={uploadedFiles.length === 0 || importing}
                >
                  <Icon name="upload-cloud" className="me-2" />
                  {importing ? (
                    <>
                      <Spinner size="sm" color="light" className="me-2" />
                      Importing...
                    </>
                  ) : (
                    'Import & Update Map'
                  )}
                </Button>
                <Button
                  color="secondary"
                  outline
                  onClick={handleRegenerateMap}
                  disabled={importing || regenerating}
                >
                  {regenerating ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      Regenerating…
                    </>
                  ) : (
                    'Regenerate Map Files'
                  )}
                </Button>
                <Button
                  color="secondary"
                  outline
                  onClick={handleClear}
                  disabled={importing || regenerating}
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>
        </Block>

        {/* Import Results */}
        {importResults && (
          <Block>
            <Card className="card-bordered">
              <div className="card-inner">
                <h6 className="mb-3">
                  <Icon name="check-circle" className="text-success me-2" />
                  Import Results
                </h6>

                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {Object.entries(importResults).map(([filename, result], idx) => (
                    <div key={idx} className={`p-3 border rounded mb-2 ${result.success ? 'bg-light' : 'bg-danger-light'}`}>
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <Icon 
                              name={result.success ? "check-circle" : "x-circle"} 
                              className={result.success ? "text-success" : "text-danger"}
                            />
                            <strong>{filename}</strong>
                            {result.layer && <Badge color="info" className="ms-2">{result.layer}</Badge>}
                          </div>
                          {result.success && (
                            <small className="text-soft">
                              ✓ Successfully imported {result.count} features
                            </small>
                          )}
                          {result.error && (
                            <small className="text-danger">
                              Error: {result.error}
                            </small>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-info-light rounded">
                  <strong>Next Steps:</strong>
                  <ul className="mb-0 mt-2 ps-3">
                    <li>Go to <strong>Network Map</strong> and click <strong>Reload data</strong></li>
                    <li>No frontend redeploy needed — the map reads from the database</li>
                    <li>Use <strong>Regenerate Map Files</strong> only for the legacy QGIS view at <code>/admin/networking/fiber/map-qgis</code></li>
                  </ul>
                  {mapLayersResult && (
                    <div className="mt-3 small">
                      <strong>Map layers:</strong>{' '}
                      {mapLayersResult.success
                        ? `${(mapLayersResult.generated || []).slice(0, 8).join(', ')}${(mapLayersResult.generated || []).length > 8 ? '…' : ''}`
                        : mapLayersResult.error || 'Regeneration failed'}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </Block>
        )}

        {/* Supported Files Info */}
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <h6 className="mb-3">
                <Icon name="layers" className="me-2" />
                Supported Files
              </h6>
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Filename Pattern</th>
                      <th>Maps To</th>
                      <th>Database Table</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>TComm_FAT.geojson</code></td>
                      <td>FAT Points</td>
                      <td>network_fat</td>
                    </tr>
                    <tr>
                      <td><code>TComm_*Closure.geojson</code></td>
                      <td>Closures</td>
                      <td>network_closures</td>
                    </tr>
                    <tr>
                      <td><code>TComm_1_2_splitter.geojson</code> etc.</td>
                      <td>Splitters (1:2, 1:4, 1:8, 1:16, 1:32)</td>
                      <td>network_splitters</td>
                    </tr>
                    <tr>
                      <td><code>TComm_*ADSS.geojson</code></td>
                      <td>Cables</td>
                      <td>network_cables</td>
                    </tr>
                    <tr>
                      <td><code>TComm_*pole*.geojson</code></td>
                      <td>Poles</td>
                      <td>network_poles</td>
                    </tr>
                    <tr>
                      <td><code>TComm_Transformer.geojson</code></td>
                      <td>Transformers</td>
                      <td>network_transformers</td>
                    </tr>
                    <tr>
                      <td><code>TComm_building.geojson</code></td>
                      <td>Buildings</td>
                      <td>network_buildings</td>
                    </tr>
                    <tr>
                      <td><code>TComm_sdu.geojson</code> etc.</td>
                      <td>Other Infrastructure</td>
                      <td>Various tables</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
}

export default ImportGeojsonAndMap;
