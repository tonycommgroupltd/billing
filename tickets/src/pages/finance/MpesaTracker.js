import React, { useState, useEffect, useCallback } from "react";
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
import { Card, Badge, Alert, Input, Spinner, Table } from "reactstrap";
import { httpNode } from '../../helpers';

// Helper: get start/end of a calendar month
// Local date string (avoids UTC timezone shift with toISOString)
const toLocalDateStr = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const todayStr = () => toLocalDateStr(new Date());

const getMonthRange = (year, month) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const today = new Date();
    const effectiveEnd = end > today ? today : end;
    return {
        start: toLocalDateStr(start),
        end: toLocalDateStr(effectiveEnd),
    };
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

const MpesaTracker = () => {
    const [selectedDate, setSelectedDate] = useState(todayStr());
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({
        totalTransactions: 0,
        totalAmount: 0,
        processedCount: 0,
        pendingCount: 0,
        failedCount: 0
    });
    const [hourlyBreakdown, setHourlyBreakdown] = useState([]);
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [error, setError] = useState(null);
    const [view, setView] = useState('today'); // 'today', 'history', 'monthly'
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searching, setSearching] = useState(false);
    
    // Date range for history — default to current calendar month
    const now = new Date();
    const defaultMonthRange = getMonthRange(now.getFullYear(), now.getMonth());
    const [startDate, setStartDate] = useState(defaultMonthRange.start);
    const [endDate, setEndDate] = useState(defaultMonthRange.end);
    const [exporting, setExporting] = useState(false);

    // Monthly view state
    const [monthlyData, setMonthlyData] = useState([]);
    const [availableYears, setAvailableYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [monthlyLoading, setMonthlyLoading] = useState(false);

    const fetchTodayData = useCallback(async (date) => {
        try {
            setLoading(true);
            setError(null);
            const response = await httpNode.get(`/finance/mpesa/today?date=${date}`);
            if (response.data.success) {
                setTransactions(response.data.transactions || []);
                setSummary(response.data.summary || {});
                setHourlyBreakdown(response.data.hourlyBreakdown || []);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load M-Pesa data');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async (start, end) => {
        try {
            setHistoryLoading(true);
            const response = await httpNode.get(`/finance/mpesa/history?start=${start}&end=${end}`);
            if (response.data.success) {
                setHistory(response.data.history || []);
            }
        } catch (err) {
            console.error('Failed to load history:', err);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const exportToExcel = async () => {
        try {
            setExporting(true);
            
            // Prepare data for export
            let exportData = [];
            let filename = '';
            
            if (view === 'today') {
                // Export today's transactions
                exportData = filteredTransactions.map(t => ({
                    'Date': t.transTime ? new Date(t.transTime).toLocaleString() : '',
                    'Trans ID': t.transId || '',
                    'Customer': `${t.firstName || ''} ${t.lastName || ''}`.trim(),
                    'Account/Phone': t.accountRef || '',
                    'Amount (KES)': t.amount || 0,
                    'Status': t.status === 2 ? 'Processed' : t.status === 0 ? 'Pending' : t.status === 3 ? 'Failed' : 'Unknown'
                }));
                filename = `mpesa_transactions_${selectedDate}.csv`;
            } else {
                // Export history summary
                exportData = history.map(h => ({
                    'Date': h.date,
                    'Total Transactions': h.totalTransactions,
                    'Total Amount (KES)': h.totalAmount,
                    'Processed': h.processedCount,
                    'Pending': h.pendingCount,
                    'Failed': h.failedCount,
                    'Avg Amount (KES)': h.avgAmount
                }));
                filename = `mpesa_history_${startDate}_to_${endDate}.csv`;
            }
            
            if (exportData.length === 0) {
                alert('No data to export');
                return;
            }
            
            // Convert to CSV
            const headers = Object.keys(exportData[0]);
            const csvContent = [
                headers.join(','),
                ...exportData.map(row => 
                    headers.map(h => {
                        let val = row[h];
                        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                            val = `"${val.replace(/"/g, '""')}"`;
                        }
                        return val;
                    }).join(',')
                )
            ].join('\n');
            
            // Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
            
        } catch (err) {
            console.error('Export failed:', err);
            alert('Failed to export data');
        } finally {
            setExporting(false);
        }
    };

    const fetchStats = useCallback(async () => {
        try {
            const response = await httpNode.get('/finance/mpesa/stats');
            if (response.data.success) {
                setStats(response.data);
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }, []);

    const fetchMonthly = useCallback(async (year) => {
        try {
            setMonthlyLoading(true);
            const url = year ? `/finance/mpesa/monthly?year=${year}` : '/finance/mpesa/monthly';
            const response = await httpNode.get(url);
            if (response.data.success) {
                setMonthlyData(response.data.months || []);
                if (response.data.availableYears?.length) {
                    setAvailableYears(response.data.availableYears);
                }
            }
        } catch (err) {
            console.error('Failed to load monthly data:', err);
        } finally {
            setMonthlyLoading(false);
        }
    }, []);

    const handleSearchAll = async () => {
        if (!searchTerm.trim()) {
            setSearchResults(null);
            return;
        }
        try {
            setSearching(true);
            const response = await httpNode.get(`/finance/mpesa?q=${encodeURIComponent(searchTerm.trim())}&per_page=100&sort=desc`);
            setSearchResults(response.data?.data || []);
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setSearching(false);
        }
    };

    const clearSearch = () => {
        setSearchTerm('');
        setSearchResults(null);
    };

    useEffect(() => {
        fetchTodayData(selectedDate);
        fetchStats();
    }, [selectedDate, fetchTodayData, fetchStats]);

    useEffect(() => {
        fetchHistory(startDate, endDate);
    }, [startDate, endDate, fetchHistory]);

    useEffect(() => {
        if (view === 'monthly') {
            fetchMonthly(selectedYear);
        }
    }, [view, selectedYear, fetchMonthly]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-KE', {
            style: 'currency',
            currency: 'KES',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('en-KE', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    const getStatusBadge = (status) => {
        switch (parseInt(status)) {
            case 2:
                return <Badge color="success">Processed</Badge>;
            case 0:
                return <Badge color="warning">Pending</Badge>;
            case 3:
                return <Badge color="danger">Failed</Badge>;
            default:
                return <Badge color="secondary">Unknown</Badge>;
        }
    };

    const filteredTransactions = transactions.filter(t => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            (t.accountRef && t.accountRef.toLowerCase().includes(search)) ||
            (t.firstName && t.firstName.toLowerCase().includes(search)) ||
            (t.transId && t.transId.toLowerCase().includes(search)) ||
            (t.phone && t.phone.includes(search))
        );
    });

    const isToday = selectedDate === todayStr();

    // Compute dynamic card values based on current view and filtered data
    const computedCards = (() => {
        if (!stats) return null;
        
        const onClickToday = () => { setSelectedDate(todayStr()); setView('today'); };
        const onClickYesterday = () => {
            const y = new Date(); y.setDate(y.getDate() - 1);
            setSelectedDate(toLocalDateStr(y)); setView('today');
        };
        const onClickThisMonth = () => {
            const range = getMonthRange(new Date().getFullYear(), new Date().getMonth());
            setStartDate(range.start); setEndDate(range.end); setView('history');
        };
        const onClickAllTime = () => { setSelectedYear(new Date().getFullYear()); setView('monthly'); };

        if (view === 'history' && history.length > 0) {
            const rangeTotal = history.reduce((sum, h) => sum + (parseFloat(h.totalAmount) || 0), 0);
            const rangeCount = history.reduce((sum, h) => sum + (parseInt(h.totalTransactions) || 0), 0);
            const rangeDays = history.length;
            const rangeAvg = rangeDays > 0 ? rangeTotal / rangeDays : 0;
            return {
                card1: { label: 'Filtered Range Total', amount: rangeTotal, sub: `${rangeCount.toLocaleString()} transactions`, color: '#4CAF50', icon: 'coins', onClick: onClickToday },
                card2: { label: `${rangeDays} Day${rangeDays !== 1 ? 's' : ''} Average`, amount: rangeAvg, sub: `${startDate} — ${endDate}`, color: '#2196F3', icon: 'calc', onClick: onClickYesterday },
                card3: { label: MONTH_NAMES[new Date().getMonth()], amount: stats.thisMonth.amount, sub: `${stats.thisMonth.count} transactions`, color: '#FF9800', icon: 'calendar', onClick: onClickThisMonth },
                card4: { label: 'All Time', amount: stats.allTime.amount, sub: `${stats.allTime.count.toLocaleString()} transactions`, color: '#9C27B0', icon: 'layers', onClick: onClickAllTime },
            };
        }
        
        if (view === 'monthly' && monthlyData.length > 0) {
            const yearTotal = monthlyData.reduce((sum, m) => sum + (parseFloat(m.totalAmount) || 0), 0);
            const yearCount = monthlyData.reduce((sum, m) => sum + (parseInt(m.totalTransactions) || 0), 0);
            const yearAvg = monthlyData.length > 0 ? yearTotal / monthlyData.length : 0;
            const bestMonth = monthlyData.reduce((best, m) => (parseFloat(m.totalAmount) || 0) > (parseFloat(best.totalAmount) || 0) ? m : best, monthlyData[0]);
            return {
                card1: { label: `${selectedYear} Total`, amount: yearTotal, sub: `${yearCount.toLocaleString()} transactions`, color: '#4CAF50', icon: 'coins', onClick: onClickToday },
                card2: { label: 'Monthly Average', amount: yearAvg, sub: `${monthlyData.length} months in ${selectedYear}`, color: '#2196F3', icon: 'calc', onClick: onClickYesterday },
                card3: { label: `Best Month`, amount: parseFloat(bestMonth.totalAmount) || 0, sub: bestMonth.monthName || '', color: '#FF9800', icon: 'award', onClick: onClickThisMonth },
                card4: { label: 'All Time', amount: stats.allTime.amount, sub: `${stats.allTime.count.toLocaleString()} transactions`, color: '#9C27B0', icon: 'layers', onClick: onClickAllTime },
            };
        }

        // Default: today view — show standard cards
        return {
            card1: { label: 'Today', amount: stats.today.amount, sub: `${stats.today.count} transactions`, color: '#4CAF50', icon: 'trending-up', onClick: onClickToday },
            card2: { label: 'Yesterday', amount: stats.yesterday.amount, sub: `${stats.yesterday.count} transactions`, color: '#2196F3', icon: 'clock', onClick: onClickYesterday },
            card3: { label: MONTH_NAMES[new Date().getMonth()], amount: stats.thisMonth.amount, sub: `${stats.thisMonth.count} transactions`, color: '#FF9800', icon: 'calendar', onClick: onClickThisMonth },
            card4: { label: 'All Time', amount: stats.allTime.amount, sub: `${stats.allTime.count.toLocaleString()} transactions`, color: '#9C27B0', icon: 'layers', onClick: onClickAllTime },
        };
    })();

    return (
        <React.Fragment>
            <Head title="M-Pesa Tracker"></Head>
            <Content>
                <BlockHead size="sm">
                    <BlockHeadContent>
                        <div className="d-flex justify-content-between align-items-center">
                            <div>
                                <BlockTitle page tag="h3">
                                    <Icon name="wallet" className="me-2" style={{ color: '#4CAF50' }} />
                                    M-Pesa Transactions
                                </BlockTitle>
                                <p className="text-muted mt-1">
                                    Track daily M-Pesa payments and collections
                                </p>
                            </div>
                            <div className="btn-group">
                                <Button 
                                    color={view === 'today' ? 'primary' : 'light'}
                                    onClick={() => setView('today')}
                                >
                                    <Icon name="calendar" className="me-1" />
                                    Daily View
                                </Button>
                                <Button 
                                    color={view === 'history' ? 'primary' : 'light'}
                                    onClick={() => setView('history')}
                                >
                                    <Icon name="activity" className="me-1" />
                                    History
                                </Button>
                                <Button 
                                    color={view === 'monthly' ? 'primary' : 'light'}
                                    onClick={() => setView('monthly')}
                                >
                                    <Icon name="bar-chart" className="me-1" />
                                    Monthly
                                </Button>
                            </div>
                        </div>
                    </BlockHeadContent>
                </BlockHead>

                {/* Stats Overview Cards */}
                {computedCards && (
                    <Block>
                        <Row className="g-3 mb-4">
                            {[computedCards.card1, computedCards.card2, computedCards.card3, computedCards.card4].map((card, idx) => (
                                <Col md="3" key={idx}>
                                    <Card 
                                        className="card-bordered" 
                                        style={{ borderLeft: `4px solid ${card.color}`, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                                        onClick={card.onClick}
                                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                                    >
                                        <div className="card-inner py-3">
                                            <div className="d-flex justify-content-between align-items-start">
                                                <div>
                                                    <h6 className="text-muted mb-1">{card.label}</h6>
                                                    <h4 className="mb-1" style={{ color: card.color }}>
                                                        {formatCurrency(card.amount)}
                                                    </h4>
                                                    <small className="text-muted">{card.sub}</small>
                                                </div>
                                                <Icon name={card.icon} style={{ fontSize: '2rem', color: card.color, opacity: 0.3 }} />
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </Block>
                )}

                {view === 'today' ? (
                    <Block>
                        {/* Controls Row */}
                        <Row className="g-3 mb-4">
                            <Col md="3">
                                <label className="form-label">Select Date</label>
                                <Input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    max={todayStr()}
                                />
                            </Col>
                            <Col md="4">
                                <label className="form-label">Search All Dates</label>
                                <div className="d-flex gap-1">
                                    <Input
                                        type="text"
                                        placeholder="Name, phone, trans ID, account..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            if (!e.target.value.trim()) setSearchResults(null);
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchAll()}
                                    />
                                    {searchResults ? (
                                        <Button color="outline-danger" size="sm" onClick={clearSearch} style={{ whiteSpace: 'nowrap' }}>
                                            <Icon name="cross" />
                                        </Button>
                                    ) : (
                                        <Button color="primary" size="sm" onClick={handleSearchAll} disabled={searching || !searchTerm.trim()} style={{ whiteSpace: 'nowrap' }}>
                                            <Icon name="search" />
                                        </Button>
                                    )}
                                </div>
                            </Col>
                            <Col md="5" className="d-flex align-items-end gap-2">
                                <Button 
                                    color="light" 
                                    onClick={() => fetchTodayData(selectedDate)}
                                    disabled={loading}
                                >
                                    <Icon name="reload" className="me-1" />
                                    Refresh
                                </Button>
                                <Button 
                                    color="success" 
                                    onClick={exportToExcel}
                                    disabled={exporting || filteredTransactions.length === 0}
                                >
                                    <Icon name="download" className="me-1" />
                                    {exporting ? 'Exporting...' : 'Export to Excel'}
                                </Button>
                            </Col>
                        </Row>

                        {/* Day Summary Cards */}
                        <Row className="g-3 mb-4">
                            <Col md="2">
                                <Card className="card-bordered bg-light text-center">
                                    <div className="card-inner py-3">
                                        <h6 className="mb-1 text-muted">Transactions</h6>
                                        <h3 className="mb-0">{summary.totalTransactions}</h3>
                                    </div>
                                </Card>
                            </Col>
                            <Col md="4">
                                <Card className="card-bordered text-center" style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)' }}>
                                    <div className="card-inner py-3">
                                        <h6 className="mb-1 text-muted">Total Amount</h6>
                                        <h3 className="mb-0" style={{ color: '#4CAF50' }}>
                                            {formatCurrency(summary.totalAmount)}
                                        </h3>
                                    </div>
                                </Card>
                            </Col>
                            <Col md="2">
                                <Card className="card-bordered text-center" style={{ backgroundColor: 'rgba(40, 167, 69, 0.1)' }}>
                                    <div className="card-inner py-3">
                                        <h6 className="mb-1 text-muted">Processed</h6>
                                        <h3 className="mb-0 text-success">{summary.processedCount}</h3>
                                    </div>
                                </Card>
                            </Col>
                            <Col md="2">
                                <Card className="card-bordered text-center" style={{ backgroundColor: 'rgba(255, 193, 7, 0.1)' }}>
                                    <div className="card-inner py-3">
                                        <h6 className="mb-1 text-muted">Pending</h6>
                                        <h3 className="mb-0 text-warning">{summary.pendingCount}</h3>
                                    </div>
                                </Card>
                            </Col>
                            <Col md="2">
                                <Card className="card-bordered text-center" style={{ backgroundColor: 'rgba(220, 53, 69, 0.1)' }}>
                                    <div className="card-inner py-3">
                                        <h6 className="mb-1 text-muted">Failed</h6>
                                        <h3 className="mb-0 text-danger">{summary.failedCount}</h3>
                                    </div>
                                </Card>
                            </Col>
                        </Row>

                        {/* Transactions Table */}
                        <Card className="card-bordered">
                            <div className="card-inner">
                                {error && (
                                    <Alert color="danger" className="mb-3">
                                        <Icon name="alert-circle" className="me-2" />
                                        {error}
                                    </Alert>
                                )}

                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="card-title mb-0">
                                        <Icon name="list" className="me-2" />
                                        Transactions on {new Date(selectedDate).toLocaleDateString('en-US', { 
                                            weekday: 'long', 
                                            year: 'numeric', 
                                            month: 'long', 
                                            day: 'numeric' 
                                        })}
                                        {isToday && <Badge color="success" className="ms-2">Today</Badge>}
                                    </h6>
                                    <small className="text-muted">
                                        Showing {filteredTransactions.length} of {transactions.length} transactions
                                    </small>
                                </div>

                                {loading ? (
                                    <div className="text-center py-5">
                                        <Spinner color="primary" />
                                        <p className="mt-2 text-muted">Loading transactions...</p>
                                    </div>
                                ) : searchResults ? (
                                    <div className="table-responsive">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <span className="text-muted">
                                                Found <strong>{searchResults.length}</strong> result{searchResults.length !== 1 ? 's' : ''} across all dates
                                            </span>
                                        </div>
                                        <Table className="table-striped">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Trans ID</th>
                                                    <th>Customer</th>
                                                    <th>Account/Phone</th>
                                                    <th className="text-end">Amount</th>
                                                    <th className="text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {searchResults.map((t, idx) => (
                                                    <tr key={t.id || idx}>
                                                        <td>
                                                            <small>{t.TransTime ? formatDateTime(t.TransTime) : '-'}</small>
                                                        </td>
                                                        <td>
                                                            <code style={{ fontSize: '0.8rem' }}>{t.TransID}</code>
                                                        </td>
                                                        <td>
                                                            <strong>{t.FirstName || '-'}</strong>
                                                            {t.LastName && <span className="text-muted ms-1">{t.LastName}</span>}
                                                        </td>
                                                        <td>
                                                            <span className="text-primary">{t.BillRefNumber || '-'}</span>
                                                        </td>
                                                        <td className="text-end">
                                                            <strong style={{ color: '#4CAF50' }}>
                                                                {formatCurrency(t.TransAmount)}
                                                            </strong>
                                                        </td>
                                                        <td className="text-center">
                                                            {getStatusBadge(t.status)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                ) : filteredTransactions.length === 0 ? (
                                    <div className="text-center py-5">
                                        <Icon name="inbox" style={{ fontSize: '3rem', color: '#ccc' }} />
                                        <p className="mt-2 text-muted">No transactions found</p>
                                    </div>
                                ) : (
                                    <div className="table-responsive">
                                        <Table className="table-striped">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Trans ID</th>
                                                    <th>Customer</th>
                                                    <th>Account/Phone</th>
                                                    <th className="text-end">Amount</th>
                                                    <th className="text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredTransactions.map((t, idx) => (
                                                    <tr key={t.id || idx}>
                                                        <td>
                                                            <small className="text-muted">
                                                                {formatTime(t.transTime)}
                                                            </small>
                                                        </td>
                                                        <td>
                                                            <code style={{ fontSize: '0.8rem' }}>{t.transId}</code>
                                                        </td>
                                                        <td>
                                                            <strong>{t.firstName || '-'}</strong>
                                                            {t.lastName && <span className="text-muted ms-1">{t.lastName}</span>}
                                                        </td>
                                                        <td>
                                                            <span className="text-primary">{t.accountRef || '-'}</span>
                                                        </td>
                                                        <td className="text-end">
                                                            <strong style={{ color: '#4CAF50' }}>
                                                                {formatCurrency(t.amount)}
                                                            </strong>
                                                        </td>
                                                        <td className="text-center">
                                                            {getStatusBadge(t.status)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </Block>
                ) : view === 'history' ? (
                    <Block>
                        {/* Date Range Controls */}
                        <Row className="g-3 mb-4">
                            <Col md="3">
                                <label className="form-label">Start Date</label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    max={endDate}
                                />
                            </Col>
                            <Col md="3">
                                <label className="form-label">End Date</label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    min={startDate}
                                    max={todayStr()}
                                />
                            </Col>
                            <Col md="6" className="d-flex align-items-end gap-2 flex-wrap">
                                <Button 
                                    color="light" 
                                    onClick={() => fetchHistory(startDate, endDate)}
                                    disabled={historyLoading}
                                >
                                    <Icon name="reload" className="me-1" />
                                    Refresh
                                </Button>
                                <Button 
                                    color="success" 
                                    onClick={exportToExcel}
                                    disabled={exporting || history.length === 0}
                                >
                                    <Icon name="download" className="me-1" />
                                    {exporting ? 'Exporting...' : 'Export'}
                                </Button>
                                <Button 
                                    color="outline-primary" 
                                    size="sm"
                                    onClick={() => {
                                        const range = getMonthRange(new Date().getFullYear(), new Date().getMonth());
                                        setStartDate(range.start);
                                        setEndDate(range.end);
                                    }}
                                >
                                    This Month
                                </Button>
                                <Button 
                                    color="outline-secondary" 
                                    size="sm"
                                    onClick={() => {
                                        const range = getMonthRange(new Date().getFullYear(), new Date().getMonth() - 1);
                                        setStartDate(range.start);
                                        setEndDate(range.end);
                                    }}
                                >
                                    Last Month
                                </Button>
                                <Input
                                    type="month"
                                    bsSize="sm"
                                    style={{ width: '170px' }}
                                    value={`${startDate.slice(0,7)}`}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            const [y, m] = e.target.value.split('-').map(Number);
                                            const range = getMonthRange(y, m - 1);
                                            setStartDate(range.start);
                                            setEndDate(range.end);
                                        }
                                    }}
                                />
                            </Col>
                        </Row>

                        {/* History View */}
                        <Card className="card-bordered">
                            <div className="card-inner">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="card-title mb-0">
                                        <Icon name="activity" className="me-2" />
                                        Daily M-Pesa History ({startDate} to {endDate})
                                    </h6>
                                    <small className="text-muted">
                                        {history.length} days | Total: {formatCurrency(history.reduce((sum, h) => sum + parseFloat(h.totalAmount || 0), 0))}
                                    </small>
                                </div>

                                {historyLoading ? (
                                    <div className="text-center py-5">
                                        <Spinner color="primary" />
                                        <p className="mt-2 text-muted">Loading history...</p>
                                    </div>
                                ) : history.length === 0 ? (
                                    <div className="text-center py-5">
                                        <Icon name="inbox" style={{ fontSize: '3rem', color: '#ccc' }} />
                                        <p className="mt-2 text-muted">No history found</p>
                                    </div>
                                ) : (
                                    <div className="table-responsive">
                                        <Table className="table-hover">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th className="text-center">Transactions</th>
                                                    <th className="text-end">Total Amount</th>
                                                    <th className="text-center">Processed</th>
                                                    <th className="text-center">Pending</th>
                                                    <th className="text-center">Failed</th>
                                                    <th className="text-end">Avg Amount</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {history.map((h, idx) => (
                                                    <tr key={idx}>
                                                        <td>
                                                            <strong>
                                                                {new Date(h.date).toLocaleDateString('en-US', { 
                                                                    weekday: 'short',
                                                                    month: 'short', 
                                                                    day: 'numeric' 
                                                                })}
                                                            </strong>
                                                            {h.date === todayStr() && (
                                                                <Badge color="success" className="ms-2">Today</Badge>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            <span className="badge bg-light text-dark">
                                                                {h.totalTransactions}
                                                            </span>
                                                        </td>
                                                        <td className="text-end">
                                                            <strong style={{ color: '#4CAF50' }}>
                                                                {formatCurrency(h.totalAmount)}
                                                            </strong>
                                                        </td>
                                                        <td className="text-center">
                                                            <Badge color="success">{h.processedCount}</Badge>
                                                        </td>
                                                        <td className="text-center">
                                                            {h.pendingCount > 0 ? (
                                                                <Badge color="warning">{h.pendingCount}</Badge>
                                                            ) : (
                                                                <span className="text-muted">0</span>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            {h.failedCount > 0 ? (
                                                                <Badge color="danger">{h.failedCount}</Badge>
                                                            ) : (
                                                                <span className="text-muted">0</span>
                                                            )}
                                                        </td>
                                                        <td className="text-end text-muted">
                                                            {formatCurrency(h.avgAmount)}
                                                        </td>
                                                        <td>
                                                            <Button 
                                                                color="light" 
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedDate(h.date);
                                                                    setView('today');
                                                                }}
                                                            >
                                                                <Icon name="eye" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </Block>
                ) : view === 'monthly' ? (
                    <Block>
                        {/* Year Filter */}
                        <Row className="g-3 mb-4">
                            <Col md="12" className="d-flex align-items-center gap-2 flex-wrap">
                                <strong className="me-2">Year:</strong>
                                {availableYears.map(yr => (
                                    <Button
                                        key={yr}
                                        color={selectedYear === yr ? 'primary' : 'outline-secondary'}
                                        size="sm"
                                        onClick={() => setSelectedYear(yr)}
                                    >
                                        {yr}
                                    </Button>
                                ))}
                                <Button
                                    color={!selectedYear ? 'primary' : 'outline-secondary'}
                                    size="sm"
                                    onClick={() => { setSelectedYear(null); fetchMonthly(null); }}
                                >
                                    All Years
                                </Button>
                            </Col>
                        </Row>

                        {/* Monthly Summary Cards */}
                        {monthlyData.length > 0 && (
                            <Row className="g-3 mb-4">
                                <Col md="4">
                                    <Card className="card-bordered text-center" style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)' }}>
                                        <div className="card-inner py-3">
                                            <h6 className="mb-1 text-muted">
                                                {selectedYear ? `Total ${selectedYear}` : 'All Time Total'}
                                            </h6>
                                            <h3 className="mb-0" style={{ color: '#4CAF50' }}>
                                                {formatCurrency(monthlyData.reduce((s, m) => s + m.totalAmount, 0))}
                                            </h3>
                                        </div>
                                    </Card>
                                </Col>
                                <Col md="4">
                                    <Card className="card-bordered text-center bg-light">
                                        <div className="card-inner py-3">
                                            <h6 className="mb-1 text-muted">Total Transactions</h6>
                                            <h3 className="mb-0">
                                                {monthlyData.reduce((s, m) => s + m.totalTransactions, 0).toLocaleString()}
                                            </h3>
                                        </div>
                                    </Card>
                                </Col>
                                <Col md="4">
                                    <Card className="card-bordered text-center" style={{ backgroundColor: 'rgba(33, 150, 243, 0.1)' }}>
                                        <div className="card-inner py-3">
                                            <h6 className="mb-1 text-muted">Monthly Average</h6>
                                            <h3 className="mb-0" style={{ color: '#2196F3' }}>
                                                {formatCurrency(monthlyData.length > 0 
                                                    ? monthlyData.reduce((s, m) => s + m.totalAmount, 0) / monthlyData.length 
                                                    : 0)}
                                            </h3>
                                        </div>
                                    </Card>
                                </Col>
                            </Row>
                        )}

                        {/* Monthly Table */}
                        <Card className="card-bordered">
                            <div className="card-inner">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="card-title mb-0">
                                        <Icon name="bar-chart" className="me-2" />
                                        Monthly M-Pesa Collections {selectedYear ? `— ${selectedYear}` : '— All Years'}
                                    </h6>
                                </div>

                                {monthlyLoading ? (
                                    <div className="text-center py-5">
                                        <Spinner color="primary" />
                                        <p className="mt-2 text-muted">Loading monthly data...</p>
                                    </div>
                                ) : monthlyData.length === 0 ? (
                                    <div className="text-center py-5">
                                        <Icon name="inbox" style={{ fontSize: '3rem', color: '#ccc' }} />
                                        <p className="mt-2 text-muted">No data found</p>
                                    </div>
                                ) : (
                                    <div className="table-responsive">
                                        <Table className="table-hover">
                                            <thead>
                                                <tr>
                                                    <th>Month</th>
                                                    <th className="text-center">Transactions</th>
                                                    <th className="text-end">Total Amount</th>
                                                    <th className="text-center">Processed</th>
                                                    <th className="text-center">Pending</th>
                                                    <th className="text-center">Failed</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {monthlyData.map((m, idx) => (
                                                    <tr key={idx}>
                                                        <td>
                                                            <strong>{m.monthName} {m.year}</strong>
                                                            {m.year === new Date().getFullYear() && m.month === new Date().getMonth() + 1 && (
                                                                <Badge color="info" className="ms-2">Current</Badge>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            <span className="badge bg-light text-dark">
                                                                {m.totalTransactions.toLocaleString()}
                                                            </span>
                                                        </td>
                                                        <td className="text-end">
                                                            <strong style={{ color: '#4CAF50' }}>
                                                                {formatCurrency(m.totalAmount)}
                                                            </strong>
                                                        </td>
                                                        <td className="text-center">
                                                            <Badge color="success">{m.processedCount.toLocaleString()}</Badge>
                                                        </td>
                                                        <td className="text-center">
                                                            {m.pendingCount > 0 ? (
                                                                <Badge color="warning">{m.pendingCount}</Badge>
                                                            ) : (
                                                                <span className="text-muted">0</span>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            {m.failedCount > 0 ? (
                                                                <Badge color="danger">{m.failedCount}</Badge>
                                                            ) : (
                                                                <span className="text-muted">0</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <Button 
                                                                color="light" 
                                                                size="sm"
                                                                onClick={() => {
                                                                    const range = getMonthRange(m.year, m.month - 1);
                                                                    setStartDate(range.start);
                                                                    setEndDate(range.end);
                                                                    setView('history');
                                                                }}
                                                            >
                                                                <Icon name="eye" /> Details
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </Block>
                ) : null}
            </Content>
        </React.Fragment>
    );
};

export default MpesaTracker;
