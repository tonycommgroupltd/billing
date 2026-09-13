import React, { useEffect, useState } from 'react';
import Head from '../../layout/head/Head';
import Content from '../../layout/content/Content';
import { Block, BlockHead, BlockHeadContent, BlockTitle, Icon } from '../../components/Component';
import { Card, Row, Col } from 'reactstrap';
import { http } from '../../helpers/http';


const SmsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSent: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
    todaySent: 0,
    weekSent: 0,
    monthSent: 0,
    balance: 0
  });
  const [recentMessages, setRecentMessages] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await http.get('/sms-dashboard-stats');
      const data = response.data;
      
      if (data.stats) {
        setStats(data.stats);
      }
      if (data.recentMessages) {
        setRecentMessages(data.recentMessages);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  return (
    <React.Fragment>
      <Head title="SMS Dashboard"></Head>
      <Content>
        <BlockHead size="sm">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                SMS Dashboard
              </BlockTitle>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>Loading...</div>
          ) : (
            <>
              {/* Stats Cards */}
              <Row className="g-gs">
                <Col sm="6" lg="3">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <div className="card-title-group align-start mb-2">
                        <div className="card-title">
                          <h6 className="subtitle">Total Sent</h6>
                        </div>
                        <div className="card-tools">
                          <Icon name="mail" className="text-primary" style={{ fontSize: '24px' }} />
                        </div>
                      </div>
                      <div className="align-end flex-sm-wrap g-4 flex-md-nowrap">
                        <div className="nk-sale-data">
                          <span className="amount">{stats.totalSent}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>

                <Col sm="6" lg="3">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <div className="card-title-group align-start mb-2">
                        <div className="card-title">
                          <h6 className="subtitle">Delivered</h6>
                        </div>
                        <div className="card-tools">
                          <Icon name="check-circle" className="text-success" style={{ fontSize: '24px' }} />
                        </div>
                      </div>
                      <div className="align-end flex-sm-wrap g-4 flex-md-nowrap">
                        <div className="nk-sale-data">
                          <span className="amount">{stats.delivered}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>

                <Col sm="6" lg="3">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <div className="card-title-group align-start mb-2">
                        <div className="card-title">
                          <h6 className="subtitle">Failed</h6>
                        </div>
                        <div className="card-tools">
                          <Icon name="cross-circle" className="text-danger" style={{ fontSize: '24px' }} />
                        </div>
                      </div>
                      <div className="align-end flex-sm-wrap g-4 flex-md-nowrap">
                        <div className="nk-sale-data">
                          <span className="amount">{stats.failed}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>

                <Col sm="6" lg="3">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <div className="card-title-group align-start mb-2">
                        <div className="card-title">
                          <h6 className="subtitle">SMS Balance</h6>
                        </div>
                        <div className="card-tools">
                          <Icon name="wallet" className="text-info" style={{ fontSize: '24px' }} />
                        </div>
                      </div>
                      <div className="align-end flex-sm-wrap g-4 flex-md-nowrap">
                        <div className="nk-sale-data">
                          <span className="amount">{stats.balance}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* Period Stats */}
              <Row className="g-gs mt-4">
                <Col md="4">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <h6 className="subtitle mb-3">Today</h6>
                      <div className="nk-sale-data">
                        <span className="amount">{stats.todaySent}</span>
                        <span className="sub-title ms-2">messages</span>
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col md="4">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <h6 className="subtitle mb-3">This Week</h6>
                      <div className="nk-sale-data">
                        <span className="amount">{stats.weekSent}</span>
                        <span className="sub-title ms-2">messages</span>
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col md="4">
                  <Card className="card-bordered">
                    <div className="card-inner">
                      <h6 className="subtitle mb-3">This Month</h6>
                      <div className="nk-sale-data">
                        <span className="amount">{stats.monthSent}</span>
                        <span className="sub-title ms-2">messages</span>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* Recent Messages */}
              <Card className="card-bordered mt-4">
                <div className="card-inner">
                  <div className="card-title-group">
                    <div className="card-title">
                      <h6 className="title">Recent Messages</h6>
                    </div>
                  </div>
                </div>
                <div className="card-inner p-0">
                  <table className="table table-tranx">
                    <thead>
                      <tr className="tb-tnx-head">
                        <th className="tb-tnx-id"><span>Recipient</span></th>
                        <th className="tb-tnx-info"><span className="d-none d-sm-inline">Message</span></th>
                        <th className="tb-tnx-amount"><span>Status</span></th>
                        <th className="tb-tnx-action"><span>Date</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMessages.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="text-center">No messages yet</td>
                        </tr>
                      ) : (
                        recentMessages.map((msg) => (
                          <tr key={msg.id} className="tb-tnx-item">
                            <td className="tb-tnx-id">
                              <span className="fw-bold">{msg.recipient}</span>
                            </td>
                            <td className="tb-tnx-info">
                              <span className="tb-lead">
                                {msg.message.length > 50 ? `${msg.message.substring(0, 50)}...` : msg.message}
                              </span>
                            </td>
                            <td className="tb-tnx-amount">
                              <span className={`badge ${
                                msg.status === 'sent' ? 'bg-success' : 
                                msg.status === 'failed' ? 'bg-danger' : 
                                'bg-warning'
                              }`}>
                                {msg.status}
                              </span>
                            </td>
                            <td className="tb-tnx-action">
                              <span className="date">{formatDate(msg.created_at)}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default SmsDashboard;
