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
import { Card, Badge, Input } from "reactstrap";
import { httpNode } from '../../helpers';

const NewCustomerTracker = () => {
    const [customers, setCustomers] = useState([]);
    const [summary, setSummary] = useState({ total: 0, totalPaid: 0, today: 0, thisWeek: 0, thisMonth: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [rangeMode, setRangeMode] = useState(false);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        if (!rangeMode) {
            fetchCustomers({ date: selectedDate });
        }
        fetchHistory();
    }, [selectedDate]);

    const fetchCustomers = async (params) => {
        try {
            setLoading(true);
            setError(null);
            const query = new URLSearchParams(params).toString();
            const response = await httpNode.get(`/finance/new-customers?${query}`);
            if (response.data.success) {
                setCustomers(response.data.customers || []);
                setSummary(response.data.summary || { total: 0, totalPaid: 0, today: 0, thisWeek: 0, thisMonth: 0 });
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load new customers');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await httpNode.get('/finance/new-customers/daily-summary?days=30');
            if (response.data.success) {
                setHistory(response.data.history || []);
        
            }
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    };

    const handleRangeSearch = () => {
        if (startDate && endDate) {
            fetchCustomers({ start: startDate, end: endDate });
        }
    };

    const handleSingleDate = (date) => {
        setSelectedDate(date);
        setRangeMode(false);
        fetchCustomers({ date });
    };

    return (
        <React.Fragment>
            <Head title="New Customer Tracker"></Head>
            <Content>
                <BlockHead size="sm">
                    <BlockHeadContent>
                        <BlockTitle page tag="h3">
                            <Icon name="user-add" className="me-2" />
                            New Customer Tracker
                        </BlockTitle>
                        <p className="text-muted mt-1">
                            Track new customer sign-ups and their first payments
                        </p>
                    </BlockHeadContent>
                </BlockHead>

                <Block>
                    {/* Controls Row */}
                    <Row className="g-3 mb-4">
                        <Col md="2">
                            <label className="form-label">Date</label>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => handleSingleDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </Col>
                        <Col md="2">
                            <label className="form-label">Or Range Start</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setRangeMode(true); }}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </Col>
                        <Col md="2">
                            <label className="form-label">Range End</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setRangeMode(true); }}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </Col>
                        <Col md="3" className="d-flex align-items-end gap-2">
                            {rangeMode && (
                                <Button color="primary" onClick={handleRangeSearch} disabled={!startDate || !endDate}>
                                    <Icon name="search" className="me-1" />
                                    Search Range
                                </Button>
                            )}
                            <Button
                                color="light"
                                onClick={() => {
                                    setRangeMode(false);
                                    setStartDate('');
                                    setEndDate('');
                                    fetchCustomers({ date: selectedDate });
                                }}
                            >
                                <Icon name="reload" className="me-1" />
                                Reset
                            </Button>
                        </Col>
                    </Row>

                    {/* Summary Cards */}
                    <Row className="g-3 mb-4">
                        <Col md="3">
                            <Card className="card-bordered bg-light">
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#816bff' }}>
                                            <Icon name="user-add" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">Today</h6>
                                            <h3 className="mb-0">{summary.today}</h3>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col md="3">
                            <Card className="card-bordered" style={{ backgroundColor: 'rgba(0, 123, 255, 0.1)' }}>
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#007bff' }}>
                                            <Icon name="calendar" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">This Week</h6>
                                            <h3 className="mb-0">{summary.thisWeek}</h3>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col md="3">
                            <Card className="card-bordered" style={{ backgroundColor: 'rgba(40, 167, 69, 0.1)' }}>
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#28a745' }}>
                                            <Icon name="users" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">This Month</h6>
                                            <h3 className="mb-0">{summary.thisMonth}</h3>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col md="3">
                            <Card className="card-bordered" style={{ backgroundColor: 'rgba(255, 193, 7, 0.1)' }}>
                                <div className="card-inner py-3">
                                    <div className="d-flex align-items-center">
                                        <div className="me-3" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffc107' }}>
                                            <Icon name="coin" style={{ color: 'white', fontSize: '1.5rem' }} />
                                        </div>
                                        <div>
                                            <h6 className="mb-0 text-muted">Shown Total Paid</h6>
                                            <h3 className="mb-0">KSh {summary.totalPaid.toLocaleString()}</h3>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    </Row>

                    {/* Customers Table */}
                    <Card className="card-bordered">
                        <div className="card-inner">
                            {error && (
                                <div className="alert alert-danger">
                                    <Icon name="alert-circle" className="me-2" />{error}
                                </div>
                            )}

                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h6 className="card-title mb-0">
                                    <Icon name="list" className="me-2" />
                                    {rangeMode && startDate && endDate
                                        ? `New customers from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
                                        : `New customers on ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                                    }
                                </h6>
                                <Badge color="primary">{customers.length} customers</Badge>
                            </div>

                            {loading ? (
                                <div className="text-center py-5">
                                    <div className="spinner-border text-primary" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <p className="mt-2">Loading new customers...</p>
                                </div>
                            ) : customers.length === 0 ? (
                                <div className="text-center py-5">
                                    <Icon name="user-cross" className="text-muted" style={{ fontSize: '3rem' }} />
                                    <h5 className="mt-3">No New Customers</h5>
                                    <p className="text-muted">No new customers registered on this date.</p>
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
                                                <th>Plan Price</th>
                                                <th>First Payment</th>
                                                <th>Payment Method</th>
                                                <th>Total Paid</th>
                                                <th>Join Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {customers.map((c, index) => (
                                                <tr key={`${c.customer_id}-${index}`}>
                                                    <td>{index + 1}</td>
                                                    <td>
                                                        <div>
                                                            <div className="fw-bold">{c.name}</div>
                                                            <small className="text-muted">ID: {c.customer_id}</small>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <a href={`tel:${c.phone}`} className="text-primary">{c.phone}</a>
                                                    </td>
                                                    <td>{c.plan_name || '-'}</td>
                                                    <td>
                                                        <strong>KSh {(parseFloat(c.plan_price) || 0).toLocaleString()}</strong>
                                                    </td>
                                                    <td>
                                                        {c.first_payment ? (
                                                            <Badge color="success">KSh {parseFloat(c.first_payment).toLocaleString()}</Badge>
                                                        ) : (
                                                            <Badge color="warning">No payment</Badge>
                                                        )}
                                                    </td>
                                                    <td>{c.payment_method || '-'}</td>
                                                    <td>
                                                        <strong>KSh {(parseFloat(c.total_paid) || 0).toLocaleString()}</strong>
                                                    </td>
                                                    <td>
                                                        {c.joined_date
                                                            ? new Date(c.joined_date).toLocaleString()
                                                            : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Daily History */}
                    {history.length > 0 && (
                        <Card className="card-bordered mt-4">
                            <div className="card-inner">
                                <h6 className="card-title mb-3">
                                    <Icon name="bar-chart" className="me-2" />
                                    Daily New Customers (Last 30 Days)
                                </h6>
                                <div className="table-responsive">
                                    <table className="table table-sm table-hover">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>New Customers</th>
                                                <th>First Payments Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((day) => {
                                                const d = typeof day.date === 'string' ? day.date.split('T')[0] : day.date;
                                                return (
                                                    <tr
                                                        key={d}
                                                        onClick={() => handleSingleDate(d)}
                                                        style={{ cursor: 'pointer' }}
                                                        className={selectedDate === d ? 'table-active' : ''}
                                                    >
                                                        <td><strong>{new Date(d).toLocaleDateString()}</strong></td>
                                                        <td>
                                                            <Badge color="primary" className="badge-sm">{day.count}</Badge>
                                                        </td>
                                                        <td>
                                                            <strong className="text-success">
                                                                KSh {(parseFloat(day.total_first_payments) || 0).toLocaleString()}
                                                            </strong>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
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

export default NewCustomerTracker;
