import React, { useState, useEffect } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    Row,
    Col,
    Button,
    Icon,
} from "../../components/Component";
import { Card, Badge, Alert, Input } from "reactstrap";
import { httpNode } from '../../helpers';

const ExpiredAccountsTracker = () => {
    const [accounts, setAccounts] = useState([]);
    const [summary, setSummary] = useState({ total: 0, expired: 0, paid: 0, disabled: 0 });
    const [snapshotExists, setSnapshotExists] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [syncing, setSyncing] = useState(false);
    const [takingSnapshot, setTakingSnapshot] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'expired', 'paid', 'disabled'
    const [history, setHistory] = useState([]);

    useEffect(() => {
        fetchAccounts(selectedDate);
        fetchHistory();
    }, [selectedDate]);

    const fetchAccounts = async (date) => {
        try {
            setLoading(true);
            setError(null);
            const response = await httpNode.get(`/finance/expired-accounts/today?date=${date}`);
            if (response.data.success) {
                setAccounts(response.data.accounts || []);
                setSummary(response.data.summary || { total: 0, expired: 0, paid: 0, disabled: 0 });
                setSnapshotExists(response.data.snapshotExists);
                setMessage(response.data.message || null);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load accounts');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await httpNode.get('/finance/expired-accounts/history');
            if (response.data.success) {
                setHistory(response.data.history || []);
            }
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    };

    const handleTakeSnapshot = async () => {
        try {
            setTakingSnapshot(true);
            const response = await httpNode.post('/finance/expired-accounts/snapshot');
            if (response.data.success) {
                alert(`Snapshot taken! ${response.data.accountsCaptured} accounts captured.`);
                fetchAccounts(selectedDate);
                fetchHistory();
            }
        } catch (err) {
            alert('Failed to take snapshot: ' + (err.response?.data?.error || 'Unknown error'));
        } finally {
            setTakingSnapshot(false);
        }
    };

    const handleSyncChanges = async () => {
        try {
            setSyncing(true);
            const response = await httpNode.post('/finance/expired-accounts/sync-changes');
            if (response.data.success) {
                alert(`Sync complete! ${response.data.summary.paidDetected} payments detected.`);
                fetchAccounts(selectedDate);
            }
        } catch (err) {
            alert('Failed to sync: ' + (err.response?.data?.error || 'Unknown error'));
        } finally {
            setSyncing(false);
        }
    };

    const filteredAccounts = accounts.filter(acc => {
        if (statusFilter === 'all') return true;
        return acc.status === statusFilter;
    });

    const isToday = selectedDate === new Date().toISOString().split('T')[0];

    return (
        <React.Fragment>
            <Head title="Bill Change Tracker"></Head>
            <Content>
                <BlockHead size="sm">
                    <BlockHeadContent>
                        <BlockTitle page tag="h3">
                            <Icon name="calendar" className="me-2" />
                            Bill Change Tracker
                        </BlockTitle>
                        <p className="text-muted mt-1">
                            <Icon name="clock" className="me-1" />
                            Snapshots are taken automatically at midnight each day
                        </p>
                    </BlockHeadContent>
                </BlockHead>

                <Block>
                    {/* Controls Row */}
                    <Row className="g-3 mb-4">
                        <Col md="3">
                            <label className="form-label">Select Date</label>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </Col>
                        <Col md="3">
                            <label className="form-label">Filter by Status</label>
                            <Input
                                type="select"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">All ({summary.total})</option>
                                <option value="expired">Expired ({summary.expired})</option>
                                <option value="disabled">Disabled ({summary.disabled})</option>
                                <option value="paid">Paid ({summary.paid})</option>
                            </Input>
                        </Col>
                        <Col md="6" className="d-flex align-items-end gap-2">
                            {isToday && !snapshotExists && (
                                <Button 
                                    color="warning" 
                                    onClick={handleTakeSnapshot}
                                    disabled={takingSnapshot}
                                    title="Manual snapshot - normally taken automatically at midnight"
                                >
                                    <Icon name="camera" className="me-1" />
                                    {takingSnapshot ? 'Taking...' : 'Manual Snapshot'}
                                </Button>
                            )}
                            {isToday && snapshotExists && (
                                <Button 
                                    color="success" 
                                    onClick={handleSyncChanges}
                                    disabled={syncing}
                                >
                                    <Icon name="refresh" className="me-1" />
                                    {syncing ? 'Syncing...' : 'Sync Payments'}
                                </Button>
                            )}
                            <Button 
                                color="light" 
                                onClick={() => fetchAccounts(selectedDate)}
                                disabled={loading}
                            >
                                <Icon name="reload" className="me-1" />
                                Refresh
                            </Button>
                        </Col>
                    </Row>

                    {/* Summary Cards */}
                    <Row className="g-3 mb-4">
                        <Col md="4">
                            <Card className="card-bordered bg-light">
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="icon-circle bg-primary me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon name="users" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">Total Accounts</h6>
                                            <h3 className="mb-0">{summary.total}</h3>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col md="4">
                            <Card className="card-bordered" style={{ backgroundColor: 'rgba(220, 53, 69, 0.1)' }}>
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="icon-circle bg-danger me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon name="alert-circle" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">Still Expired</h6>
                                            <h3 className="mb-0 text-danger">{summary.expired + summary.disabled}</h3>
                                            {summary.disabled > 0 && (
                                                <small className="text-muted">{summary.expired} expired + {summary.disabled} disabled</small>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col md="4">
                            <Card className="card-bordered" style={{ backgroundColor: 'rgba(40, 167, 69, 0.1)' }}>
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="icon-circle bg-success me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon name="check-circle" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">Paid</h6>
                                            <h3 className="mb-0 text-success">{summary.paid}</h3>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    </Row>

                    {/* Main Table Card */}
                    <Card className="card-bordered">
                        <div className="card-inner">
                            {error && (
                                <Alert color="danger" className="mb-3">
                                    <Icon name="alert-circle" className="me-2" />
                                    {error}
                                </Alert>
                            )}

                            {message && !snapshotExists && (
                                <Alert color="info" className="mb-3">
                                    <Icon name="info" className="me-2" />
                                    {message}
                                </Alert>
                            )}

                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h6 className="card-title mb-0">
                                    <Icon name="list" className="me-2" />
                                    Accounts expiring on {new Date(selectedDate).toLocaleDateString('en-US', { 
                                        weekday: 'long', 
                                        year: 'numeric', 
                                        month: 'long', 
                                        day: 'numeric' 
                                    })}
                                </h6>
                                <Badge color={snapshotExists ? "success" : "secondary"}>
                                    {snapshotExists ? "📸 Snapshot Captured" : "Live Data"}
                                </Badge>
                            </div>

                            {loading ? (
                                <div className="text-center py-5">
                                    <div className="spinner-border text-primary" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <p className="mt-2">Loading accounts...</p>
                                </div>
                            ) : filteredAccounts.length === 0 ? (
                                <div className="text-center py-5">
                                    <Icon name="inbox" className="text-muted" style={{ fontSize: '3rem' }} />
                                    <h5 className="mt-3">No Accounts Found</h5>
                                    <p className="text-muted">
                                        {!snapshotExists && isToday 
                                            ? 'No snapshot yet for today. Snapshots are taken automatically at midnight, or click "Manual Snapshot" to capture now.'
                                            : !snapshotExists
                                                ? 'No snapshot was taken for this date. Showing live data.'
                                                : 'No accounts match your filter criteria.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-hover table-striped">
                                        <thead className="table-light">
                                            <tr>
                                                <th>#</th>
                                                <th>Customer</th>
                                                <th>Phone</th>
                                                <th>Plan</th>
                                                <th>Amount</th>
                                                <th>Original Bill Date</th>
                                                <th>New Expiry Date</th>
                                                <th>Days Overdue</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredAccounts.map((account, index) => (
                                                <tr key={`${account.customerId}-${account.serviceId}`}>
                                                    <td>{index + 1}</td>
                                                    <td>
                                                        <div>
                                                            <div className="fw-bold">{account.name}</div>
                                                            <small className="text-muted">ID: {account.customerId}</small>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <a href={`tel:${account.phone}`} className="text-primary">
                                                            {account.phone}
                                                        </a>
                                                    </td>
                                                    <td>{account.planName || '-'}</td>
                                                    <td>
                                                        <strong>KSh {(parseFloat(account.price) || 0).toLocaleString()}</strong>
                                                    </td>
                                                    <td>
                                                        {account.originalBillTo 
                                                            ? new Date(account.originalBillTo).toLocaleDateString()
                                                            : account.billTo 
                                                                ? new Date(account.billTo).toLocaleDateString()
                                                                : '-'}
                                                    </td>
                                                    <td>
                                                        {account.status === 'paid' && account.newExpiryDate ? (
                                                            <Badge color="success" className="badge-sm">
                                                                {new Date(account.newExpiryDate).toLocaleDateString()}
                                                            </Badge>
                                                        ) : account.currentBillTo ? (
                                                            new Date(account.currentBillTo).toLocaleDateString()
                                                        ) : '-'}
                                                    </td>
                                                    <td>
                                                        <Badge color={account.daysOverdue > 7 ? "danger" : "warning"} className="badge-sm">
                                                            {account.daysOverdue} days
                                                        </Badge>
                                                    </td>
                                                    <td>
                                                        {account.status === 'paid' ? (
                                                            <Badge color="success">
                                                                <Icon name="check" className="me-1" />
                                                                PAID
                                                            </Badge>
                                                        ) : account.status === 'disabled' ? (
                                                            <Badge color="dark">
                                                                <Icon name="na" className="me-1" />
                                                                DISABLED
                                                            </Badge>
                                                        ) : (
                                                            <Badge color="danger">
                                                                <Icon name="alert-circle" className="me-1" />
                                                                EXPIRED
                                                            </Badge>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* History Section */}
                    {history.length > 0 && (
                        <Card className="card-bordered mt-4">
                            <div className="card-inner">
                                <h6 className="card-title mb-3">
                                    <Icon name="clock" className="me-2" />
                                    Daily Snapshots History (Click date to view)
                                </h6>
                                <p className="text-muted small mb-3">
                                    Snapshots are captured automatically at midnight. Select a date to see who was expiring and track payments.
                                </p>
                                <div className="table-responsive">
                                    <table className="table table-sm table-hover">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Total</th>
                                                <th>Expired</th>
                                                <th>Paid</th>
                                                <th>Amount Collected</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((day) => (
                                                <tr 
                                                    key={day.date} 
                                                    onClick={() => setSelectedDate(day.date.split('T')[0])}
                                                    style={{ cursor: 'pointer' }}
                                                    className={selectedDate === day.date.split('T')[0] ? 'table-active' : ''}
                                                >
                                                    <td>
                                                        <strong>{new Date(day.date).toLocaleDateString()}</strong>
                                                    </td>
                                                    <td>{day.total}</td>
                                                    <td>
                                                        <Badge color="danger" className="badge-sm">{day.expired}</Badge>
                                                    </td>
                                                    <td>
                                                        <Badge color="success" className="badge-sm">{day.paid}</Badge>
                                                    </td>
                                                    <td>
                                                        <strong className="text-success">
                                                            KSh {(parseFloat(day.amountCollected) || 0).toLocaleString()}
                                                        </strong>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Card>
                    )}
                </Block>
            </Content>
        </React.Fragment>
    );
};

export default ExpiredAccountsTracker;
