import React, { useState, useEffect } from 'react';
import Head from '../../layout/head/Head';
import Content from '../../layout/content/Content';
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from '../../components/Component';
import { Card, Row, Col, FormGroup, Label, Input } from 'reactstrap';
import { http } from '../../helpers/http';


const SmsReports = () => {
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [summary, setSummary] = useState({
    total: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
    deliveryRate: 0
  });
  const [messages, setMessages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [messagesPerPage] = useState(50);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await http.get('/sms-reports', {
        params: {
          from: dateFrom,
          to: dateTo
        }
      });

      if (response.data) {
        if (response.data.summary) {
          setSummary(response.data.summary);
        }
        if (response.data.messages) {
          setMessages(response.data.messages);
        }
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadReports();
  };

  const handleExport = () => {
    // Create CSV content
    let csv = 'Recipient,Message,Status,Date\n';
    messages.forEach(msg => {
      const recipient = msg.recipient.replace(/,/g, '');
      const message = msg.message.replace(/,/g, ' ').replace(/\n/g, ' ');
      const status = msg.status;
      const date = new Date(msg.created_at).toLocaleString();
      csv += `${recipient},"${message}",${status},"${date}"\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms-report-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  // Pagination
  const indexOfLastMessage = currentPage * messagesPerPage;
  const indexOfFirstMessage = indexOfLastMessage - messagesPerPage;
  const currentMessages = messages.slice(indexOfFirstMessage, indexOfLastMessage);
  const totalPages = Math.ceil(messages.length / messagesPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <React.Fragment>
      <Head title="SMS Reports"></Head>
      <Content>
        <BlockHead size="sm">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                SMS Reports
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="primary" onClick={handleExport} disabled={messages.length === 0}>
                <Icon name="download" /> Export to CSV
              </Button>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          {/* Date Range Filter */}
          <Card className="card-bordered mb-3">
            <div className="card-inner">
              <Row>
                <Col md="4">
                  <FormGroup>
                    <Label>From Date</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>To Date</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="4" style={{ display: 'flex', alignItems: 'end' }}>
                  <FormGroup style={{ width: '100%' }}>
                    <Button color="primary" size="md" onClick={handleSearch} disabled={loading} style={{ width: '100%' }}>
                      {loading ? 'Loading...' : 'Search'}
                    </Button>
                  </FormGroup>
                </Col>
              </Row>
            </div>
          </Card>

          {/* Summary Cards */}
          <Row className="g-gs mb-3">
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
                  <div className="align-end">
                    <div className="nk-sale-data">
                      <span className="amount">{summary.total}</span>
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
                  <div className="align-end">
                    <div className="nk-sale-data">
                      <span className="amount">{summary.delivered}</span>
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
                  <div className="align-end">
                    <div className="nk-sale-data">
                      <span className="amount">{summary.failed}</span>
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
                      <h6 className="subtitle">Delivery Rate</h6>
                    </div>
                    <div className="card-tools">
                      <Icon name="trend-up" className="text-info" style={{ fontSize: '24px' }} />
                    </div>
                  </div>
                  <div className="align-end">
                    <div className="nk-sale-data">
                      <span className="amount">{summary.deliveryRate}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* Messages Table */}
          <Card className="card-bordered">
            <div className="card-inner">
              <div className="card-title-group mb-3">
                <div className="card-title">
                  <h6 className="title">SMS Messages ({messages.length} total)</h6>
                </div>
              </div>
            </div>
            <div className="card-inner p-0">
              <div style={{ overflowX: 'auto' }}>
                <table className="table table-tranx">
                  <thead>
                    <tr className="tb-tnx-head">
                      <th className="tb-tnx-id"><span>Recipient</span></th>
                      <th className="tb-tnx-info"><span>Message</span></th>
                      <th className="tb-tnx-amount" style={{ width: '100px' }}><span>Status</span></th>
                      <th className="tb-tnx-action" style={{ width: '180px' }}><span>Date</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="text-center">Loading...</td>
                      </tr>
                    ) : currentMessages.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center">No messages found for the selected period</td>
                      </tr>
                    ) : (
                      currentMessages.map((msg) => (
                        <tr key={msg.id} className="tb-tnx-item">
                          <td className="tb-tnx-id">
                            <span className="fw-bold">{msg.recipient}</span>
                          </td>
                          <td className="tb-tnx-info">
                            <span className="tb-lead" style={{ fontSize: '12px' }}>
                              {msg.message.length > 80 ? `${msg.message.substring(0, 80)}...` : msg.message}
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
                            <span className="date" style={{ fontSize: '12px' }}>{formatDate(msg.created_at)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="card-inner">
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <Button
                    size="sm"
                    color="light"
                    disabled={currentPage === 1}
                    onClick={() => paginate(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  
                  <span style={{ margin: '0 16px' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  
                  <Button
                    size="sm"
                    color="light"
                    disabled={currentPage === totalPages}
                    onClick={() => paginate(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default SmsReports;
