import React, { useState, useEffect, useCallback } from 'react';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { 
  Block, BlockHead, BlockTitle, BlockBetween, BlockHeadContent, 
  Icon, Button, DataTableHead, DataTableRow, DataTableItem 
} from "../../../components/Component";
import { Card, Badge, Spinner, Input, Row, Col } from "reactstrap";
import { Link } from "react-router-dom";

const ClosureList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [hubFilter, setHubFilter] = useState('');
  const [hubs, setHubs] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editCounts, setEditCounts] = useState({});
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiUrl}/network-map.php?type=closures`);
      
      if (!response.ok) throw new Error('Failed to fetch closures data');
      
      const result = await response.json();
      if (result.success) {
        setData(result.closures || []);
        // Extract unique hub names
        const uniqueHubs = [...new Set((result.closures || []).map(c => c.hub_name).filter(Boolean))];
        setHubs(uniqueHubs);
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (err) {
      console.error('Error loading closures:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Start editing a Closure's splitter counts
  const startEditing = (item) => {
    setEditingId(item.id);
    setEditCounts({
      '1_2': item.splitter_1_2_count || 0,
      '1_4': item.splitter_1_4_count || 0,
      '1_8': item.splitter_1_8_count || 0,
      '1_16': item.splitter_1_16_count || 0,
      '1_32': item.splitter_1_32_count || 0
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setEditCounts({});
  };

  // Save splitter counts
  const saveSplitterCounts = async (id) => {
    try {
      setSaving(true);
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      
      const response = await fetch(`${apiUrl}/network-map.php/update-splitter-counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'closure',
          id: id,
          counts: editCounts,
          updatedBy: 'Admin User' // TODO: use actual logged-in user when auth context is available
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Update local data
        setData(prevData => 
          prevData.map(item => 
            item.id === id 
              ? {
                  ...item,
                  splitter_1_2_count: editCounts['1_2'],
                  splitter_1_4_count: editCounts['1_4'],
                  splitter_1_8_count: editCounts['1_8'],
                  splitter_1_16_count: editCounts['1_16'],
                  splitter_1_32_count: editCounts['1_32']
                }
              : item
          )
        );
        setEditingId(null);
        setEditCounts({});
        alert('Splitter counts updated successfully!');
      } else {
        throw new Error(result.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error saving splitter counts:', err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Update a specific count
  const updateCount = (splitterType, value) => {
    const numValue = parseInt(value) || 0;
    setEditCounts(prev => ({
      ...prev,
      [splitterType]: numValue >= 0 ? numValue : 0
    }));
  };

  // Filter data
  const filteredData = data.filter(item => {
    const matchesSearch = !search || 
      (item.fid && item.fid.toLowerCase().includes(search.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesHub = !hubFilter || item.hub_name === hubFilter;
    return matchesSearch && matchesHub;
  });

  return (
    <>
      <Head title="Closures - Fiber Structure" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="package" className="me-2" />
                Fiber Closures
              </BlockTitle>
              <p className="text-soft">Fiber splice closures and enclosures in the network</p>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to="/admin/networking/fiber/map" className="btn btn-outline-primary me-2">
                <Icon name="map" className="me-1" />
                View on Map
              </Link>
              <Button color="primary" outline onClick={loadData} disabled={loading}>
                <Icon name="reload" className="me-1" />
                Refresh
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              {/* Filters */}
              <Row className="g-3 mb-3">
                <Col md="4">
                  <Input
                    type="text"
                    placeholder="Search by FID or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Col>
                <Col md="3">
                  <Input
                    type="select"
                    value={hubFilter}
                    onChange={(e) => setHubFilter(e.target.value)}
                  >
                    <option value="">All Hubs</option>
                    {hubs.map(hub => (
                      <option key={hub} value={hub}>{hub}</option>
                    ))}
                  </Input>
                </Col>
                <Col md="5" className="text-end">
                  <Badge color="warning" className="me-2">
                    Total: {data.length}
                  </Badge>
                  <Badge color="info">
                    Showing: {filteredData.length}
                  </Badge>
                </Col>
              </Row>

              {loading && (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Loading closures...</p>
                </div>
              )}

              {error && !loading && (
                <div className="text-center py-5">
                  <Icon name="alert-circle" className="text-danger" style={{ fontSize: '48px' }} />
                  <p className="text-danger mt-2">{error}</p>
                  <Button color="primary" size="sm" onClick={loadData}>Try Again</Button>
                </div>
              )}

              {!loading && !error && (
                <div style={{overflowX: 'auto', WebkitOverflowScrolling: 'touch'}}>
                  <div className="nk-tb-list nk-tb-ulist is-compact" style={{minWidth: '1200px'}}>
                    <DataTableHead>
                      <DataTableRow size="sm"><span className="sub-text">#</span></DataTableRow>
                      <DataTableRow><span className="sub-text">FID</span></DataTableRow>
                      <DataTableRow size="lg"><span className="sub-text">Description</span></DataTableRow>
                      <DataTableRow><span className="sub-text">Hub</span></DataTableRow>
                      <DataTableRow className="text-center"><span className="sub-text">1:2</span></DataTableRow>
                      <DataTableRow className="text-center"><span className="sub-text">1:4</span></DataTableRow>
                      <DataTableRow className="text-center"><span className="sub-text">1:8</span></DataTableRow>
                      <DataTableRow className="text-center"><span className="sub-text">1:16</span></DataTableRow>
                      <DataTableRow className="text-center"><span className="sub-text">1:32</span></DataTableRow>
                      <DataTableRow className="text-center"><span className="sub-text">Total</span></DataTableRow>
                      <DataTableRow><span className="sub-text">Last Updated</span></DataTableRow>
                      <DataTableRow><span className="sub-text">Updated By</span></DataTableRow>
                      <DataTableRow><span className="sub-text">Status</span></DataTableRow>
                      <DataTableRow className="text-end"><span className="sub-text">Actions</span></DataTableRow>
                    </DataTableHead>
                  
                  {filteredData.length === 0 ? (
                    <div className="text-center py-4 text-soft">No closures found</div>
                  ) : (
                    filteredData.map((item, index) => {
                      const isEditing = editingId === item.id;
                      const totalSplitters = (item.splitter_1_2_count || 0) + 
                                           (item.splitter_1_4_count || 0) + 
                                           (item.splitter_1_8_count || 0) + 
                                           (item.splitter_1_16_count || 0) + 
                                           (item.splitter_1_32_count || 0);

                      return (
                        <DataTableItem key={item.id}>
                          <DataTableRow size="sm">
                            <span className="text-soft">{index + 1}</span>
                          </DataTableRow>
                          <DataTableRow>
                            <span className="fw-bold text-warning">{item.fid || `CL-${item.id}`}</span>
                          </DataTableRow>
                          <DataTableRow size="lg">
                            <span className="text-ellipsis" style={{ maxWidth: '200px', display: 'block' }}>
                              {item.description || '-'}
                            </span>
                          </DataTableRow>
                          <DataTableRow>
                            <Badge color="outline-info">{item.hub_name || '-'}</Badge>
                          </DataTableRow>
                          
                          {/* Splitter Count Columns */}
                          {isEditing ? (
                            <>
                              <DataTableRow className="text-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  value={editCounts['1_2']} 
                                  onChange={(e) => updateCount('1_2', e.target.value)}
                                  style={{ width: '60px', padding: '4px' }}
                                />
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  value={editCounts['1_4']} 
                                  onChange={(e) => updateCount('1_4', e.target.value)}
                                  style={{ width: '60px', padding: '4px' }}
                                />
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  value={editCounts['1_8']} 
                                  onChange={(e) => updateCount('1_8', e.target.value)}
                                  style={{ width: '60px', padding: '4px' }}
                                />
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  value={editCounts['1_16']} 
                                  onChange={(e) => updateCount('1_16', e.target.value)}
                                  style={{ width: '60px', padding: '4px' }}
                                />
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  value={editCounts['1_32']} 
                                  onChange={(e) => updateCount('1_32', e.target.value)}
                                  style={{ width: '60px', padding: '4px' }}
                                />
                              </DataTableRow>
                            </>
                          ) : (
                            <>
                              <DataTableRow className="text-center">
                                <Badge color="light">{item.splitter_1_2_count || 0}</Badge>
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Badge color="light">{item.splitter_1_4_count || 0}</Badge>
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Badge color="light">{item.splitter_1_8_count || 0}</Badge>
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Badge color="light">{item.splitter_1_16_count || 0}</Badge>
                              </DataTableRow>
                              <DataTableRow className="text-center">
                                <Badge color="light">{item.splitter_1_32_count || 0}</Badge>
                              </DataTableRow>
                            </>
                          )}
                          
                          <DataTableRow className="text-center">
                            <Badge color={totalSplitters > 0 ? 'warning' : 'secondary'}>
                              {totalSplitters}
                            </Badge>
                          </DataTableRow>
                          
                          <DataTableRow>
                            <span className="text-soft" style={{ fontSize: '12px' }}>
                              {item.splitters_updated_at ? 
                                new Date(item.splitters_updated_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }) : '-'}
                            </span>
                          </DataTableRow>
                          
                          <DataTableRow>
                            <span className="text-soft" style={{ fontSize: '12px' }}>
                              {item.splitters_updated_by || '-'}
                            </span>
                          </DataTableRow>
                          
                          <DataTableRow>
                            <Badge color={item.status === 'active' ? 'success' : 'secondary'}>
                              {item.status || 'active'}
                            </Badge>
                          </DataTableRow>
                          
                          <DataTableRow className="text-end">
                            {isEditing ? (
                              <div className="d-flex gap-1 justify-content-end">
                                <Button 
                                  color="success" 
                                  size="sm" 
                                  onClick={() => saveSplitterCounts(item.id)}
                                  disabled={saving}
                                >
                                  <Icon name="check" />
                                </Button>
                                <Button 
                                  color="secondary" 
                                  size="sm" 
                                  onClick={cancelEditing}
                                  disabled={saving}
                                >
                                  <Icon name="cross" />
                                </Button>
                              </div>
                            ) : (
                              <Button 
                                color="warning" 
                                size="sm" 
                                outline
                                onClick={() => startEditing(item)}
                                disabled={editingId !== null}
                              >
                                <Icon name="edit" className="me-1" />
                                Edit
                              </Button>
                            )}
                          </DataTableRow>
                        </DataTableItem>
                      );
                    })
                  )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Block>
      </Content>
    </>
  );
};

export default ClosureList;
