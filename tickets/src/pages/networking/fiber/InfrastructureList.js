import React, { useState, useEffect, useCallback } from 'react';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { 
  Block, BlockHead, BlockTitle, BlockBetween, BlockHeadContent, 
  Icon, Button
} from "../../../components/Component";
import { Card, Badge, Spinner, Row, Col, Progress } from "reactstrap";
import { Link } from "react-router-dom";

const InfrastructureList = () => {
  const [data, setData] = useState({
    fat: [],
    closures: [],
    splitters: [],
    poles: [],
    cables: [],
    hubs: []
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiUrl}/network-map.php?type=all`);
      
      if (!response.ok) throw new Error('Failed to fetch infrastructure data');
      
      const result = await response.json();
      if (result.success) {
        const fatData = result.fat || [];
        const closureData = result.closures || [];
        
        // Calculate splitter statistics
        const splitterStats = {
          fat: {
            total: fatData.length,
            '1_2': 0, '1_4': 0, '1_8': 0, '1_16': 0, '1_32': 0,
            totalSplitters: 0,
            withSplitters: 0
          },
          closure: {
            total: closureData.length,
            '1_2': 0, '1_4': 0, '1_8': 0, '1_16': 0, '1_32': 0,
            totalSplitters: 0,
            withSplitters: 0
          }
        };

        fatData.forEach(fat => {
          const counts = {
            '1_2': fat.splitter_1_2_count || 0,
            '1_4': fat.splitter_1_4_count || 0,
            '1_8': fat.splitter_1_8_count || 0,
            '1_16': fat.splitter_1_16_count || 0,
            '1_32': fat.splitter_1_32_count || 0
          };
          Object.keys(counts).forEach(key => {
            splitterStats.fat[key] += counts[key];
          });
          const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
          splitterStats.fat.totalSplitters += total;
          if (total > 0) splitterStats.fat.withSplitters++;
        });

        closureData.forEach(closure => {
          const counts = {
            '1_2': closure.splitter_1_2_count || 0,
            '1_4': closure.splitter_1_4_count || 0,
            '1_8': closure.splitter_1_8_count || 0,
            '1_16': closure.splitter_1_16_count || 0,
            '1_32': closure.splitter_1_32_count || 0
          };
          Object.keys(counts).forEach(key => {
            splitterStats.closure[key] += counts[key];
          });
          const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
          splitterStats.closure.totalSplitters += total;
          if (total > 0) splitterStats.closure.withSplitters++;
        });

        setData({
          fat: fatData,
          closures: closureData,
          splitters: result.splitters || [],
          poles: result.poles || [],
          cables: result.cables || [],
          hubs: result.hubs || []
        });
        setStats(splitterStats);
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (err) {
      console.error('Error loading infrastructure:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <>
      <Head title="Fiber Structure Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="activity" className="me-2" />
                Fiber Structure Dashboard
              </BlockTitle>
              <p className="text-soft">Overview of fiber network infrastructure and splitter distribution</p>
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

        {loading && (
          <Block>
            <div className="text-center py-5">
              <Spinner color="primary" />
              <p className="mt-2">Loading infrastructure data...</p>
            </div>
          </Block>
        )}

        {error && !loading && (
          <Block>
            <div className="text-center py-5">
              <Icon name="alert-circle" className="text-danger" style={{ fontSize: '48px' }} />
              <p className="text-danger mt-2">{error}</p>
              <Button color="primary" size="sm" onClick={loadData}>Try Again</Button>
            </div>
          </Block>
        )}

        {!loading && !error && stats && (
          <>
            {/* Overview Cards */}
            <Block>
              <Row className="g-3">
                <Col sm="6" md="3">
                  <Card className="card-bordered text-center">
                    <div className="card-inner p-4">
                      <Icon name="server" className="text-primary fs-2 mb-2" />
                      <div className="fs-3 fw-bold text-primary">{stats.fat.total}</div>
                      <div className="text-soft">FAT Points</div>
                    </div>
                  </Card>
                </Col>
                <Col sm="6" md="3">
                  <Card className="card-bordered text-center">
                    <div className="card-inner p-4">
                      <Icon name="package" className="text-warning fs-2 mb-2" />
                      <div className="fs-3 fw-bold text-warning">{stats.closure.total}</div>
                      <div className="text-soft">Closures</div>
                    </div>
                  </Card>
                </Col>
                <Col sm="6" md="3">
                  <Card className="card-bordered text-center">
                    <div className="card-inner p-4">
                      <Icon name="git-branch" className="text-success fs-2 mb-2" />
                      <div className="fs-3 fw-bold text-success">
                        {stats.fat.totalSplitters + stats.closure.totalSplitters}
                      </div>
                      <div className="text-soft">Total Splitters</div>
                    </div>
                  </Card>
                </Col>
                <Col sm="6" md="3">
                  <Card className="card-bordered text-center">
                    <div className="card-inner p-4">
                      <Icon name="layers" className="text-info fs-2 mb-2" />
                      <div className="fs-3 fw-bold text-info">
                        {data.poles.length + data.cables.length + data.hubs.length}
                      </div>
                      <div className="text-soft">Other Infrastructure</div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </Block>

            {/* FAT Splitter Statistics */}
            <Block>
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                      <h5 className="mb-1">
                        <Icon name="server" className="text-primary me-2" />
                        FAT Splitter Distribution
                      </h5>
                      <p className="text-soft mb-0">
                        {stats.fat.withSplitters} of {stats.fat.total} FATs have splitters installed
                      </p>
                    </div>
                    <Link to="/admin/networking/fiber/fat" className="btn btn-primary btn-sm">
                      <Icon name="list" className="me-1" />
                      View FAT List
                    </Link>
                  </div>

                  <Row className="g-3">
                    {['1_2', '1_4', '1_8', '1_16', '1_32'].map(type => {
                      const count = stats.fat[type];
                      const percentage = stats.fat.totalSplitters > 0 
                        ? (count / stats.fat.totalSplitters * 100).toFixed(1) 
                        : 0;
                      
                      return (
                        <Col key={type} md="6" lg="4">
                          <div className="p-3 border rounded">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <h6 className="mb-0">{type.replace('_', ':')} Splitters</h6>
                              <Badge color="primary" className="fs-6">{count}</Badge>
                            </div>
                            <Progress value={percentage} className="mb-1" color="primary" style={{ height: '8px' }} />
                            <small className="text-soft">{percentage}% of total FAT splitters</small>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>

                  <div className="mt-4 p-3 bg-light rounded text-center">
                    <strong>Total FAT Splitters: {stats.fat.totalSplitters}</strong>
                    <span className="text-soft ms-3">
                      • Coverage: {((stats.fat.withSplitters / stats.fat.total) * 100).toFixed(1)}% of FATs
                    </span>
                  </div>
                </div>
              </Card>
            </Block>

            {/* Closure Splitter Statistics */}
            <Block>
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                      <h5 className="mb-1">
                        <Icon name="package" className="text-warning me-2" />
                        Closure Splitter Distribution
                      </h5>
                      <p className="text-soft mb-0">
                        {stats.closure.withSplitters} of {stats.closure.total} Closures have splitters installed
                      </p>
                    </div>
                    <Link to="/admin/networking/fiber/closures" className="btn btn-warning btn-sm">
                      <Icon name="list" className="me-1" />
                      View Closure List
                    </Link>
                  </div>

                  <Row className="g-3">
                    {['1_2', '1_4', '1_8', '1_16', '1_32'].map(type => {
                      const count = stats.closure[type];
                      const percentage = stats.closure.totalSplitters > 0 
                        ? (count / stats.closure.totalSplitters * 100).toFixed(1) 
                        : 0;
                      
                      return (
                        <Col key={type} md="6" lg="4">
                          <div className="p-3 border rounded">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <h6 className="mb-0\">{type.replace('_', ':')} Splitters</h6>
                              <Badge color="warning" className="fs-6">{count}</Badge>
                            </div>
                            <Progress value={percentage} className="mb-1" color="warning" style={{ height: '8px' }} />
                            <small className="text-soft">{percentage}% of total Closure splitters</small>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>

                  <div className="mt-4 p-3 bg-light rounded text-center">
                    <strong>Total Closure Splitters: {stats.closure.totalSplitters}</strong>
                    <span className="text-soft ms-3">
                      • Coverage: {((stats.closure.withSplitters / stats.closure.total) * 100).toFixed(1)}% of Closures
                    </span>
                  </div>
                </div>
              </Card>
            </Block>

            {/* Quick Stats Grid */}
            <Block>
              <Row className="g-3">
                <Col md="6">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <h6 className="mb-3">
                        <Icon name="flag" className="text-info me-2" />
                        Network Poles
                      </h6>
                      <Row>
                        <Col xs="6">
                          <div className="text-center p-3 border rounded">
                            <div className="fs-4 fw-bold text-info">{data.poles.filter(p => p.pole_type === 'tcom').length}</div>
                            <small className="text-soft">TCom Poles</small>
                          </div>
                        </Col>
                        <Col xs="6">
                          <div className="text-center p-3 border rounded">
                            <div className="fs-4 fw-bold text-warning">{data.poles.filter(p => p.pole_type === 'kplc').length}</div>
                            <small className="text-soft">KPLC Poles</small>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </Card>
                </Col>
                <Col md="6">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <h6 className="mb-3">
                        <Icon name="link" className="text-primary me-2" />
                        Fiber Cables
                      </h6>
                      <Row>
                        <Col xs="4">
                          <div className="text-center p-3 border rounded">
                            <div className="fs-4 fw-bold text-primary">{data.cables.filter(c => c.cable_type === '24C').length}</div>
                            <small className="text-soft">24C ADSS</small>
                          </div>
                        </Col>
                        <Col xs="4">
                          <div className="text-center p-3 border rounded">
                            <div className="fs-4 fw-bold text-primary">{data.cables.filter(c => c.cable_type === '48C').length}</div>
                            <small className="text-soft">48C ADSS</small>
                          </div>
                        </Col>
                        <Col xs="4">
                          <div className="text-center p-3 border rounded">
                            <div className="fs-4 fw-bold text-primary">{data.cables.filter(c => c.cable_type === '12C').length}</div>
                            <small className="text-soft">12C ADSS</small>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </Card>
                </Col>
              </Row>
            </Block>
          </>
        )}
      </Content>
    </>
  );
};

export default InfrastructureList;
