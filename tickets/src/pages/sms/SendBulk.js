import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from '../../layout/head/Head';
import Content from '../../layout/content/Content';
import {
  Block, BlockHead, BlockHeadContent, BlockTitle, BlockDes,
  Button, Icon
} from '../../components/Component';
import {
  Card, Row, Col, FormGroup, Label, Input, Spinner, Badge,
  Modal, ModalHeader, ModalBody, ModalFooter, Progress,
  Alert
} from 'reactstrap';
import { http } from '../../helpers/http';
import { showSuccess, showError, showWarning } from '../../utils/notifications';
import { normalizeKenyanPhone, getKenyanSubscriberDigits } from '../../utils/phone';

const SendBulkSms = () => {
  // ── Tab state ──
  const [activeTab, setActiveTab] = useState('customers');

  // ── Customers tab ──
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Active');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusCounts, setStatusCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, per_page: 100, total: 0, total_pages: 0 });

  // ── CSV tab ──
  const [csvFile, setCsvFile] = useState(null);
  const [csvRecipients, setCsvRecipients] = useState([]);
  const [csvParsed, setCsvParsed] = useState(false);

  // ── Manual tab ──
  const [manualNumbers, setManualNumbers] = useState('');

  // ── Message ──
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // ── Balance & Stats ──
  const [balance, setBalance] = useState(null);

  // ── Sending state ──
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // ── Confirmation modal ──
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // ── Character / SMS counting ──
  const charCount = message.length;
  const smsCount = Math.max(1, Math.ceil(message.length / 160));

  // ─────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────
  const loadCustomers = useCallback(async (page = 1) => {
    setLoadingCustomers(true);
    try {
      const params = new URLSearchParams({
        action: 'customers',
        page: page,
        per_page: 100,
        status: statusFilter,
      });
      if (searchTerm) params.set('search', searchTerm);

      const res = await http.get(`/bulk-sms.php?${params}`);
      if (res.data.success) {
        setCustomers(res.data.data || []);
        setPagination(res.data.pagination || {});
        if (res.data.status_counts) {
          setStatusCounts(res.data.status_counts);
        }
      }
    } catch (err) {
      console.error('Load customers error:', err);
      showError('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  }, [statusFilter, searchTerm]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await http.get(`/bulk-sms.php?action=templates`);
      if (res.data.success) {
        setTemplates(res.data.data || []);
      }
    } catch (err) {
      console.error('Load templates error:', err);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const res = await http.get(`/bulk-sms.php?action=balance`);
      if (res.data.success) {
        setBalance(res.data.balance);
      }
    } catch (err) {
      console.error('Load balance error:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTemplates();
    loadBalance();
  }, [loadTemplates, loadBalance]);

  // Reload customers when filters change
  useEffect(() => {
    if (activeTab === 'customers') {
      const timer = setTimeout(() => loadCustomers(1), 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, statusFilter, searchTerm, loadCustomers]);

  // ─────────────────────────────────────────────
  // Selection helpers
  // ─────────────────────────────────────────────
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(customers.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleCustomer = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allSelected = customers.length > 0 && customers.every(c => selectedIds.has(c.id));

  // ─────────────────────────────────────────────
  // Template handling
  // ─────────────────────────────────────────────
  const handleTemplateSelect = (e) => {
    const templateId = e.target.value;
    setSelectedTemplate(templateId);
    if (templateId) {
      const tmpl = templates.find(t => String(t.id) === String(templateId));
      if (tmpl) {
        setMessage(tmpl.message);
      }
    }
  };

  // ─────────────────────────────────────────────
  // CSV Parsing
  // ─────────────────────────────────────────────
  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setCsvParsed(false);
    setCsvRecipients([]);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const parsed = [];

      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/"/g, ''));
        // Try to detect: first row might be header
        if (i === 0 && (parts[0].toLowerCase().includes('name') || parts[1]?.toLowerCase().includes('phone'))) {
          continue; // Skip header
        }
        if (parts.length >= 2 && parts[1]) {
          parsed.push({ name: parts[0], phone: parts[1] });
        } else if (parts.length === 1 && /^\d/.test(parts[0])) {
          parsed.push({ name: '', phone: parts[0] });
        }
      }

      setCsvRecipients(parsed);
      setCsvParsed(true);

      if (parsed.length === 0) {
        showWarning('No valid phone numbers found in CSV');
      } else {
        showSuccess(`Parsed ${parsed.length} recipients from CSV`);
      }
    } catch (err) {
      showError('Error reading CSV file');
      console.error(err);
    }
  };

  // ─────────────────────────────────────────────
  // Manual numbers parsing
  // ─────────────────────────────────────────────
  const parsedManualNumbers = useMemo(() => {
    if (!manualNumbers.trim()) return [];
    const seen = new Set();
    const out = [];
    manualNumbers.split(/[,\n;]+/).forEach((raw) => {
      const normalized = normalizeKenyanPhone(raw.trim());
      if (!normalized) return;
      const key = getKenyanSubscriberDigits(normalized);
      if (key.length < 9 || seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out;
  }, [manualNumbers]);

  // ─────────────────────────────────────────────
  // Recipient count per tab
  // ─────────────────────────────────────────────
  const getRecipientCount = () => {
    switch (activeTab) {
      case 'customers': return selectedIds.size;
      case 'csv': return csvRecipients.length;
      case 'manual': return parsedManualNumbers.length;
      default: return 0;
    }
  };

  const totalCost = getRecipientCount() * smsCount;

  // ─────────────────────────────────────────────
  // Send Confirmation
  // ─────────────────────────────────────────────
  const [sendAllMatching, setSendAllMatching] = useState(false);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSendAllMatching(false);
    setShowConfirm(false);
  };

  const handlePreSend = (allMatching = false) => {
    // Only the Customers tab can send to the full filtered list
    if (activeTab !== 'customers') {
      allMatching = false;
    }
    const recipientCount = allMatching ? pagination.total : getRecipientCount();

    if (recipientCount === 0) {
      if (activeTab === 'manual') {
        showWarning('Enter at least one valid Kenyan phone number (07..., 01..., or 254...)');
      } else if (activeTab === 'csv') {
        showWarning('Upload a CSV with at least one valid phone number');
      } else {
        showWarning(allMatching ? 'No customers match the current filter' : 'Please select at least one recipient');
      }
      return;
    }
    if (!message.trim()) {
      showWarning('Please enter a message');
      return;
    }
    const cost = recipientCount * smsCount;
    if (balance !== null && cost > balance) {
      showError(`Insufficient balance. Need ${cost} credits but have ${balance}`);
      return;
    }

    setSendAllMatching(allMatching);
    setConfirmData({
      recipientCount,
      smsPerPerson: smsCount,
      totalSms: recipientCount * smsCount,
      balance: balance,
      messagePreview: message.length > 120 ? message.substring(0, 120) + '...' : message,
      allMatching
    });
    setShowConfirm(true);
  };

  // ─────────────────────────────────────────────
  // Send SMS
  // ─────────────────────────────────────────────
  const handleSend = async () => {
    setShowConfirm(false);
    setSending(true);
    setSendResult(null);

    try {
      let response;

      if (activeTab === 'customers' && sendAllMatching) {
        response = await http.post(`/bulk-sms.php?action=send`, {
          message,
          campaign_name: `Bulk SMS to ${statusFilter} customers - ${new Date().toLocaleDateString()}`,
          filter: {
            status: statusFilter,
            search: searchTerm,
          },
        });
      } else if (activeTab === 'customers') {
        response = await http.post(`/bulk-sms.php?action=send`, {
          message,
          campaign_name: `Bulk SMS to selected customers - ${new Date().toLocaleDateString()}`,
          recipients: customers
            .filter(c => selectedIds.has(c.id))
            .map(c => ({
              id: c.id,
              phone_number: c.phone_number,
              full_name: c.full_name || c.customer_name || c.name || ''
            })),
        });
      } else if (activeTab === 'csv') {
        response = await http.post(`/bulk-sms.php?action=send`, {
          message,
          recipients: csvRecipients.map(r => ({
            id: null,
            phone_number: normalizeKenyanPhone(r.phone) || r.phone,
            full_name: r.name || ''
          })),
          campaign_name: `CSV Bulk SMS - ${new Date().toLocaleDateString()}`
        });
      } else if (activeTab === 'manual') {
        response = await http.post(`/bulk-sms.php?action=send`, {
          message,
          recipients: parsedManualNumbers.map(phone => ({
            id: null,
            phone_number: phone,
            full_name: ''
          })),
          campaign_name: `Manual Bulk SMS - ${new Date().toLocaleDateString()}`
        });
      }

      if (response?.data) {
        setSendResult(response.data);
        if (response.data.sent > 0) {
          showSuccess(response.data.message || `${response.data.sent} SMS sent successfully!`);
        }
        if (response.data.failed > 0) {
          showWarning(`${response.data.failed} messages failed to send`);
        }
        // Refresh balance
        loadBalance();
      }
    } catch (err) {
      console.error('Send error:', err);
      showError('Failed to send SMS: ' + (err.response?.data?.message || err.message));
    } finally {
      setSending(false);
      setSendAllMatching(false);
    }
  };

  // ─────────────────────────────────────────────
  // Status color helper
  // ─────────────────────────────────────────────
  const statusColor = (status) => {
    const s = (status || '').toString().toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'expired') return 'danger';
    if (s === 'disabled') return 'secondary';
    return 'secondary';
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <React.Fragment>
      <Head title="Bulk SMS" />
      <Content>
        {/* Page Header */}
        <BlockHead size="sm">
          <div className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: '12px' }}>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="send" /> Bulk SMS
              </BlockTitle>
              <BlockDes className="text-soft">
                Send SMS to customers from Customer Services (live Splynx data)
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="d-flex align-items-center" style={{ gap: '16px' }}>
                <div style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #f0faf5 0%, #e3f6ed 100%)',
                  borderRadius: '8px',
                  border: '1px solid #c3e6d5',
                }}>
                  <span style={{ fontSize: '12px', color: '#526484', display: 'block' }}>SMS Balance</span>
                  <span style={{ fontSize: '20px', fontWeight: '700', color: '#1ee0ac' }}>
                    {balance !== null ? Number(balance).toLocaleString() : <Spinner size="sm" />}
                  </span>
                </div>
              </div>
            </BlockHeadContent>
          </div>
        </BlockHead>

        {/* Send Result Alert */}
        {sendResult && (
          <Block>
            <Alert color={sendResult.failed === 0 ? 'success' : sendResult.sent === 0 ? 'danger' : 'warning'} className="alert-icon">
              <Icon name={sendResult.failed === 0 ? 'check-circle' : 'alert-circle'} />
              <strong>{sendResult.message}</strong>
              <div className="mt-1" style={{ fontSize: '13px' }}>
                <Badge color="success" className="me-2">✓ {sendResult.sent} Sent</Badge>
                {sendResult.failed > 0 && <Badge color="danger">✗ {sendResult.failed} Failed</Badge>}
              </div>
              {sendResult.errors && sendResult.errors.length > 0 && (
                <div className="mt-2" style={{ fontSize: '12px', opacity: 0.8 }}>
                  {sendResult.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
              <button className="close" onClick={() => setSendResult(null)} style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </Alert>
          </Block>
        )}

        <Block>
          <Row className="g-gs">
            {/* Left Column: Recipients */}
            <Col xl="7" lg="7">
              {/* Tab Navigation */}
              <Card className="card-bordered" style={{ borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ borderBottom: '1px solid #e5e9f2' }}>
                  <ul className="nav nav-tabs nav-tabs-card" style={{ margin: 0 }}>
                    {[
                      { key: 'customers', icon: 'users', label: 'Customers' },
                      { key: 'csv', icon: 'upload', label: 'CSV Upload' },
                      { key: 'manual', icon: 'edit', label: 'Manual Entry' },
                    ].map(tab => (
                      <li className="nav-item" key={tab.key}>
                        <a
                          className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
                          onClick={() => handleTabChange(tab.key)}
                          style={{ cursor: 'pointer', padding: '14px 20px' }}
                        >
                          <Icon name={tab.icon} /> <span>{tab.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* ── Customers Tab ── */}
                {activeTab === 'customers' && (
                  <div className="card-inner">
                    {/* Filters Row */}
                    <Row className="g-3 mb-3">
                      <Col md="5">
                        <div className="form-control-wrap">
                          <div className="form-icon form-icon-left">
                            <Icon name="search" />
                          </div>
                          <Input
                            type="text"
                            className="form-control"
                            placeholder="Search name, phone, plan, PPPoE..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '36px' }}
                          />
                        </div>
                      </Col>
                      <Col md="4">
                        <Input
                          type="select"
                          value={statusFilter}
                          onChange={e => { setStatusFilter(e.target.value); setSelectedIds(new Set()); }}
                        >
                          <option value="all">All services</option>
                          <option value="Active">Active ({statusCounts.active?.toLocaleString?.() ?? statusCounts.active ?? 0})</option>
                          <option value="Expired">Expired ({statusCounts.expired?.toLocaleString?.() ?? statusCounts.expired ?? 0})</option>
                          <option value="Disabled">Disabled ({statusCounts.disabled?.toLocaleString?.() ?? statusCounts.disabled ?? 0})</option>
                        </Input>
                      </Col>
                      <Col md="3">
                        <small className="text-soft d-block" style={{ paddingTop: '10px' }}>
                          Same list as Customer Services menu
                        </small>
                      </Col>
                    </Row>

                    {/* Select All & Count */}
                    <div className="d-flex justify-content-between align-items-center flex-wrap mb-2" style={{ padding: '8px 0', gap: '8px' }}>
                      <label style={{ cursor: 'pointer', marginBottom: 0, fontWeight: '600', fontSize: '13px' }}>
                        <Input
                          type="checkbox"
                          checked={allSelected}
                          onChange={handleSelectAll}
                          style={{ marginRight: '8px' }}
                        />
                        Select all on this page
                      </label>
                      <div className="d-flex align-items-center flex-wrap" style={{ gap: '8px' }}>
                        <Badge color="primary" pill>{selectedIds.size} selected</Badge>
                        <Badge color="outline-secondary" pill>{pagination.total} matching</Badge>
                        {pagination.total > 0 && (
                          <Button
                            color="outline-primary"
                            size="sm"
                            onClick={() => handlePreSend(true)}
                            disabled={sending}
                          >
                            Send to all {pagination.total} matching
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Customer List */}
                    <div style={{
                      maxHeight: '420px',
                      overflowY: 'auto',
                      border: '1px solid #e5e9f2',
                      borderRadius: '6px',
                    }}>
                      {loadingCustomers ? (
                        <div className="text-center py-5">
                          <Spinner color="primary" />
                          <p className="mt-2 text-soft">Loading customers...</p>
                        </div>
                      ) : (
                        <table className="table table-hover" style={{ marginBottom: 0 }}>
                          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f5f6fa', zIndex: 1 }}>
                            <tr>
                              <th style={{ width: '40px' }}></th>
                              <th>Customer</th>
                              <th>Phone</th>
                              <th>Plan</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customers.length === 0 ? (
                              <tr>
                                <td colSpan="5" className="text-center py-4 text-soft">
                                  <Icon name="users" style={{ fontSize: '24px', opacity: 0.3 }} />
                                  <p className="mt-1">No customers found matching filters</p>
                                </td>
                              </tr>
                            ) : customers.map(c => (
                              <tr
                                key={c.id}
                                onClick={() => handleToggleCustomer(c.id)}
                                style={{
                                  cursor: 'pointer',
                                  backgroundColor: selectedIds.has(c.id) ? '#f0f6ff' : 'transparent',
                                  transition: 'background-color 0.15s'
                                }}
                              >
                                <td>
                                  <Input
                                    type="checkbox"
                                    checked={selectedIds.has(c.id)}
                                    onChange={() => {}}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                </td>
                                <td>
                                  <div style={{ fontWeight: '500' }}>{c.full_name || c.customer_name || '-'}</div>
                                  {c.city && <small className="text-soft">{c.city}</small>}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                                  {c.phone_number || '—'}
                                </td>
                                <td style={{ fontSize: '12px' }}>{c.plan_name || '—'}</td>
                                <td>
                                  <Badge color={statusColor(c.status)} pill style={{ fontSize: '11px' }}>
                                    {c.status || 'N/A'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Pagination */}
                    {pagination.total_pages > 1 && (
                      <div className="d-flex justify-content-between align-items-center mt-3">
                        <small className="text-soft">
                          Page {pagination.page} of {pagination.total_pages}
                        </small>
                        <div className="d-flex" style={{ gap: '8px' }}>
                          <Button
                            size="sm"
                            color="light"
                            disabled={pagination.page <= 1}
                            onClick={() => loadCustomers(pagination.page - 1)}
                          >
                            <Icon name="chevron-left" /> Prev
                          </Button>
                          <Button
                            size="sm"
                            color="light"
                            disabled={pagination.page >= pagination.total_pages}
                            onClick={() => loadCustomers(pagination.page + 1)}
                          >
                            Next <Icon name="chevron-right" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── CSV Tab ── */}
                {activeTab === 'csv' && (
                  <div className="card-inner">
                    <div style={{
                      padding: '16px',
                      background: '#f5f6fa',
                      borderRadius: '6px',
                      marginBottom: '16px'
                    }}>
                      <h6 className="mb-2"><Icon name="info" /> CSV File Format</h6>
                      <p className="mb-1" style={{ fontSize: '13px' }}>
                        Your CSV should have columns: <strong>Name, Phone Number</strong>
                      </p>
                      <code style={{ fontSize: '12px', display: 'block', background: '#fff', padding: '8px', borderRadius: '4px' }}>
                        Name, Phone{'\n'}
                        John Doe, 0712345678{'\n'}
                        Jane Smith, 0723456789
                      </code>
                    </div>

                    <FormGroup>
                      <Label>Select CSV File</Label>
                      <Input
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleCsvUpload}
                      />
                    </FormGroup>

                    {csvParsed && (
                      <div className="mt-3">
                        <Alert color={csvRecipients.length > 0 ? 'success' : 'warning'}>
                          <Icon name={csvRecipients.length > 0 ? 'check' : 'alert-circle'} />
                          {csvRecipients.length > 0
                            ? ` Found ${csvRecipients.length} recipients in CSV`
                            : ' No valid recipients found in CSV'
                          }
                        </Alert>

                        {csvRecipients.length > 0 && (
                          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e5e9f2', borderRadius: '6px' }}>
                            <table className="table" style={{ marginBottom: 0, fontSize: '13px' }}>
                              <thead style={{ position: 'sticky', top: 0, background: '#f5f6fa' }}>
                                <tr>
                                  <th>#</th>
                                  <th>Name</th>
                                  <th>Phone</th>
                                </tr>
                              </thead>
                              <tbody>
                                {csvRecipients.slice(0, 50).map((r, i) => (
                                  <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>{r.name || '-'}</td>
                                    <td style={{ fontFamily: 'monospace' }}>{r.phone}</td>
                                  </tr>
                                ))}
                                {csvRecipients.length > 50 && (
                                  <tr>
                                    <td colSpan="3" className="text-center text-soft">
                                      ...and {csvRecipients.length - 50} more
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Manual Tab ── */}
                {activeTab === 'manual' && (
                  <div className="card-inner">
                    <Alert color="info" className="py-2 mb-3" style={{ fontSize: '13px' }}>
                      Numbers here are sent <strong>only</strong> to what you type below — not Active customers or selections from the Customers tab.
                    </Alert>
                    <FormGroup>
                      <Label>
                        Phone Numbers
                        <small className="text-soft ms-2">(comma, semicolon, or newline separated)</small>
                      </Label>
                      <Input
                        type="textarea"
                        rows="10"
                        value={manualNumbers}
                        onChange={e => setManualNumbers(e.target.value)}
                        placeholder={`0712345678\n0723456789\n0734567890`}
                        style={{ fontFamily: 'monospace', fontSize: '13px' }}
                      />
                    </FormGroup>
                    <div className="d-flex justify-content-between">
                      <small className="text-soft">
                        Enter Kenyan phone numbers (07XX, 01XX, or 254XX format)
                      </small>
                      <Badge color={parsedManualNumbers.length > 0 ? 'primary' : 'light'} pill>
                        {parsedManualNumbers.length} valid numbers
                      </Badge>
                    </div>
                  </div>
                )}
              </Card>
            </Col>

            {/* Right Column: Message Composer */}
            <Col xl="5" lg="5">
              {/* Template Selection */}
              <Card className="card-bordered mb-3" style={{ borderRadius: '8px' }}>
                <div className="card-inner">
                  <h6 className="mb-3"><Icon name="layers" /> Quick Templates</h6>
                  <Input
                    type="select"
                    value={selectedTemplate}
                    onChange={handleTemplateSelect}
                    style={{ marginBottom: '4px' }}
                  >
                    <option value="">-- Select a template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Input>
                  <small className="text-soft">
                    Messages use &quot;Dear customer&quot;. [[account]] is filled with the recipient paybill account (phone) when sending.
                  </small>
                </div>
              </Card>

              {/* Message Composer */}
              <Card className="card-bordered mb-3" style={{ borderRadius: '8px' }}>
                <div className="card-inner">
                  <h6 className="mb-3"><Icon name="edit" /> Compose Message</h6>
                  <FormGroup>
                    <Input
                      type="textarea"
                      rows="7"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Type your message here..."
                      maxLength={640}
                      style={{ resize: 'vertical', fontSize: '14px', lineHeight: '1.6' }}
                    />
                  </FormGroup>

                  {/* Char/SMS counter bar */}
                  <div className="d-flex justify-content-between" style={{ fontSize: '12px', color: '#8094ae' }}>
                    <span>
                      <strong>{charCount}</strong> / 640 characters
                    </span>
                    <span>
                      <strong>{smsCount}</strong> SMS per recipient
                    </span>
                  </div>

                  <Progress
                    value={Math.min(100, (charCount / 640) * 100)}
                    color={charCount > 480 ? 'warning' : charCount > 320 ? 'info' : 'success'}
                    style={{ height: '3px', marginTop: '8px' }}
                  />

                  <div className="mt-3" style={{
                    padding: '10px 12px',
                    background: '#fff8e5',
                    borderRadius: '6px',
                    border: '1px solid #ffe9a0',
                    fontSize: '12px',
                    color: '#8a6d3b'
                  }}>
                    <Icon name="info" /> "STOP *456*9*5#" opt-out text will be auto-appended
                  </div>
                </div>
              </Card>

              {/* Send Summary */}
              <Card className="card-bordered" style={{ borderRadius: '8px', border: '2px solid #e5e9f2' }}>
                <div className="card-inner">
                  <h6 className="mb-3"><Icon name="report-profit" /> Send Summary</h6>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ padding: '12px', background: '#f0f6ff', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: '#6576ff' }}>
                        {getRecipientCount()}
                      </div>
                      <div style={{ fontSize: '11px', color: '#526484' }}>Recipients</div>
                    </div>
                    <div style={{ padding: '12px', background: '#f0faf5', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: '#1ee0ac' }}>
                        {totalCost}
                      </div>
                      <div style={{ fontSize: '11px', color: '#526484' }}>Total SMS</div>
                    </div>
                  </div>

                  {balance !== null && totalCost > balance && (
                    <Alert color="danger" className="py-2 mb-3" style={{ fontSize: '13px' }}>
                      <Icon name="alert-circle" /> Insufficient balance! Need {totalCost} credits, have {balance}.
                    </Alert>
                  )}

                  <Button
                    color="primary"
                    size="lg"
                    block
                    onClick={handlePreSend}
                    disabled={sending || getRecipientCount() === 0 || !message.trim()}
                  >
                    {sending ? (
                      <>
                        <Spinner size="sm" className="me-2" />
                        Sending SMS...
                      </>
                    ) : (
                      <>
                        <Icon name="send" /> Send {getRecipientCount() > 0 ? `to ${getRecipientCount()} recipient${getRecipientCount() !== 1 ? 's' : ''}` : 'Bulk SMS'}
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>

        {/* ── Confirmation Modal ── */}
        <Modal isOpen={showConfirm} toggle={() => setShowConfirm(false)} size="md">
          <ModalHeader toggle={() => setShowConfirm(false)}>
            <Icon name="alert-circle" style={{ color: '#f4bd0e' }} /> Confirm Bulk SMS
          </ModalHeader>
          <ModalBody>
            {confirmData && (
              <>
                <div style={{
                  background: '#f5f6fa',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '16px'
                }}>
                  <Row>
                    <Col xs="4" className="text-center">
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#6576ff' }}>
                        {confirmData.recipientCount}
                      </div>
                      <small className="text-soft">Recipients</small>
                    </Col>
                    <Col xs="4" className="text-center">
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#09c2de' }}>
                        {confirmData.smsPerPerson}
                      </div>
                      <small className="text-soft">SMS Each</small>
                    </Col>
                    <Col xs="4" className="text-center">
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#1ee0ac' }}>
                        {confirmData.totalSms}
                      </div>
                      <small className="text-soft">Total SMS</small>
                    </Col>
                  </Row>
                </div>

                <div style={{
                  background: '#fafafa',
                  border: '1px solid #e5e9f2',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  maxHeight: '150px',
                  overflowY: 'auto'
                }}>
                  {confirmData.messagePreview}
                </div>

                {confirmData.balance !== null && (
                  <div className="mt-3 text-soft" style={{ fontSize: '13px' }}>
                    Balance after sending: <strong>{confirmData.balance - confirmData.totalSms}</strong> SMS credits
                  </div>
                )}

                {confirmData.allMatching && activeTab === 'customers' && (
                  <p className="text-soft mb-2" style={{ fontSize: '13px' }}>
                    Sending to <strong>all customers</strong> matching the current filter from Customer Services (not only this page).
                  </p>
                )}
                {activeTab === 'manual' && (
                  <p className="text-soft mb-2" style={{ fontSize: '13px' }}>
                    Sending only to the <strong>{parsedManualNumbers.length}</strong> number(s) you entered — not the customer list.
                  </p>
                )}

                <Alert color="warning" className="mt-3 py-2" style={{ fontSize: '13px' }}>
                  <Icon name="alert" /> This action will send real SMS messages and deduct credits from your account. This cannot be undone.
                </Alert>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="light" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleSend}>
              <Icon name="send" /> Yes, Send Now
            </Button>
          </ModalFooter>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default SendBulkSms;
