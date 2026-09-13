/**
 * BonusSummary.js - Main bonus tracking page
 * Auto-syncs bonuses from tickets on load, shows per-technician summary + ticket detail
 * Uses updated_at from tickets for reliable date tracking
 * Default range: Feb 1, 2026 → today
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import BonusAPI from '../../helpers/BonusAPI';
import './BonusSummary.css';

const BonusSummary = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [techBreakdown, setTechBreakdown] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
  const [activeTab, setActiveTab] = useState('technicians'); // 'technicians' or 'tickets'
  
  // Add Technician Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [technicianToAdd, setTechnicianToAdd] = useState('');
  const [addingTechnician, setAddingTechnician] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addSuccess, setAddSuccess] = useState(null);
  
  // Pay Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingTech, setPayingTech] = useState(null);
  const [payReference, setPayReference] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const [paySuccess, setPaySuccess] = useState(null);
  
  // Per-Ticket Pay State
  const [showTicketPayModal, setShowTicketPayModal] = useState(false);
  const [payingTicket, setPayingTicket] = useState(null);
  const [ticketPayReference, setTicketPayReference] = useState('');
  const [payingTicketLoading, setPayingTicketLoading] = useState(false);
  const [ticketPayError, setTicketPayError] = useState(null);
  const [ticketPaySuccess, setTicketPaySuccess] = useState(null);
  
  // Technicians list for dropdown
  const [techniciansList, setTechniciansList] = useState([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  
  // Filters - Default to February 2026
  const [startDate, setStartDate] = useState('2026-02-01');
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [technician, setTechnician] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [syncMessage, setSyncMessage] = useState(null);
  const [activePreset, setActivePreset] = useState('custom');

  // Quick date presets
  const applyDatePreset = (preset) => {
    const today = new Date().toISOString().split('T')[0];
    setActivePreset(preset);
    switch (preset) {
      case 'today': {
        setStartDate(today);
        setEndDate(today);
        break;
      }
      case 'yesterday': {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        setStartDate(yesterday);
        setEndDate(yesterday);
        break;
      }
      case 'this_week': {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        setStartDate(monday.toISOString().split('T')[0]);
        setEndDate(today);
        break;
      }
      case 'last_week': {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const lastMonday = new Date(now);
        lastMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        setStartDate(lastMonday.toISOString().split('T')[0]);
        setEndDate(lastSunday.toISOString().split('T')[0]);
        break;
      }
      case 'this_month': {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        setStartDate(firstDay);
        setEndDate(today);
        break;
      }
      case 'feb_2026': {
        setStartDate('2026-02-01');
        setEndDate('2026-02-28');
        break;
      }
      case 'all': {
        setStartDate('2025-01-01');
        setEndDate(today);
        break;
      }
      default:
        break;
    }
  };

  const resetAllFilters = () => {
    setStartDate('2026-02-01');
    setEndDate(new Date().toISOString().split('T')[0]);
    setTechnician('');
    setPaymentStatus('');
    setTypeFilter('');
    setActivePreset('custom');
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  // Auto-sync on first load & fetch technicians list
  useEffect(() => {
    const init = async () => {
      await syncBonuses(true); // silent sync
      fetchTechnicians();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTechnicians = async () => {
    try {
      setLoadingTechnicians(true);
      const response = await BonusAPI.getTechnicians();
      if (response.success && response.data) {
        setTechniciansList(response.data);
      }
    } catch (err) {
      console.error('Error fetching technicians:', err);
    } finally {
      setLoadingTechnicians(false);
    }
  };

  // Sync bonuses from tickets
  const syncBonuses = async (silent = false) => {
    try {
      if (!silent) setSyncing(true);
      // Always clear & recalculate to ensure accuracy (created_at based)
      const response = await BonusAPI.syncBonuses(startDate, endDate, true);
      if (response.success && !silent) {
        setSyncMessage(`✅ Synced: ${response.stats?.records_inserted || 0} new bonus records from ${response.stats?.tickets_processed || 0} tickets`);
        setTimeout(() => setSyncMessage(null), 5000);
      }
    } catch (err) {
      console.error('Error syncing bonuses:', err);
      if (!silent) setSyncMessage('⚠️ Sync failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSyncing(false);
      // Always fetch data after sync
      fetchData();
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await BonusAPI.getTicketBonusList({
        start_date: startDate,
        end_date: endDate,
        technician: technician,
        payment_status: paymentStatus,
        type_filter: typeFilter,
        limit: pagination.limit,
        offset: pagination.offset
      });
      
      if (response.success) {
        setTickets(response.data || []);
        setSummary(response.summary || null);
        setTechBreakdown(response.technician_breakdown || []);
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0
        }));
      } else {
        setError(response.message || 'Failed to load data');
      }
    } catch (err) {
      console.error('Error fetching bonus list:', err);
      setError(err.message || 'Failed to load bonus data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, technician, paymentStatus, typeFilter, pagination.limit, pagination.offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilter = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, offset: 0 }));
    fetchData();
  };

  const handlePageChange = (newOffset) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
  };

  const openAddTechnicianModal = (ticket) => {
    setSelectedTicket(ticket);
    setTechnicianToAdd('');
    setAddError(null);
    setAddSuccess(null);
    setShowAddModal(true);
  };

  const closeAddTechnicianModal = () => {
    setShowAddModal(false);
    setSelectedTicket(null);
    setTechnicianToAdd('');
    setAddError(null);
    setAddSuccess(null);
  };

  const handleAddTechnician = async (e) => {
    e.preventDefault();
    if (!technicianToAdd.trim()) {
      setAddError('Please select a technician');
      return;
    }
    try {
      setAddingTechnician(true);
      setAddError(null);
      const response = await BonusAPI.addTechnicianToBonus(selectedTicket.ticket_id, technicianToAdd.trim());
      if (response.success) {
        setAddSuccess(`✅ ${response.message || 'Technician added successfully!'}`);
        setTimeout(() => { closeAddTechnicianModal(); fetchData(); }, 1500);
      } else {
        setAddError(response.message || 'Failed to add technician');
      }
    } catch (err) {
      setAddError(err.message || 'Failed to add technician');
    } finally {
      setAddingTechnician(false);
    }
  };

  const openPayModal = (tech) => {
    setPayingTech(tech);
    setPayReference('');
    setPayError(null);
    setPaySuccess(null);
    setShowPayModal(true);
  };

  const closePayModal = () => {
    setShowPayModal(false);
    setPayingTech(null);
    setPayReference('');
    setPayError(null);
    setPaySuccess(null);
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!payingTech) return;
    try {
      setPaying(true);
      setPayError(null);
      const response = await BonusAPI.payBonus(payingTech.id, [], payReference.trim());
      if (response.success) {
        setPaySuccess(`✅ ${response.message || 'Payment recorded!'} (${response.records_updated || 0} records updated)`);
        setTimeout(() => { closePayModal(); fetchData(); }, 2000);
      } else {
        setPayError(response.message || 'Failed to record payment');
      }
    } catch (err) {
      setPayError(err.message || 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Per-ticket pay functions
  const openTicketPayModal = (ticket) => {
    setPayingTicket(ticket);
    setTicketPayReference('');
    setTicketPayError(null);
    setTicketPaySuccess(null);
    setShowTicketPayModal(true);
  };

  const closeTicketPayModal = () => {
    setShowTicketPayModal(false);
    setPayingTicket(null);
    setTicketPayReference('');
    setTicketPayError(null);
    setTicketPaySuccess(null);
  };

  const handleTicketPay = async (e) => {
    e.preventDefault();
    if (!payingTicket || !payingTicket.record_ids?.length) return;
    try {
      setPayingTicketLoading(true);
      setTicketPayError(null);
      // Pay only the pending record_ids for this specific ticket
      const response = await BonusAPI.payBonus(0, payingTicket.record_ids, ticketPayReference.trim());
      if (response.success) {
        setTicketPaySuccess(`✅ ${response.message || 'Payment recorded!'} (${response.records_updated || 0} records updated)`);
        setTimeout(() => { closeTicketPayModal(); fetchData(); }, 1500);
      } else {
        setTicketPayError(response.message || 'Failed to record payment');
      }
    } catch (err) {
      setTicketPayError(err.message || 'Failed to record payment');
    } finally {
      setPayingTicketLoading(false);
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="bonus-summary-page">
      <div className="page-header">
        <div>
          <h1>📊 Bonus Tracking Summary</h1>
          <p className="subtitle">All technician bonuses from February 2026 • Installation (after 4/day) & Resolved (after 10/day) = KSh 100 each</p>
        </div>
        <button 
          className="sync-btn" 
          onClick={() => syncBonuses(false)} 
          disabled={syncing}
          style={{
            padding: '10px 20px', background: syncing ? '#94a3b8' : '#4f46e5', color: '#fff',
            border: 'none', borderRadius: '8px', cursor: syncing ? 'wait' : 'pointer',
            fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync Bonuses'}
        </button>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div style={{
          padding: '10px 16px', margin: '0 0 16px', borderRadius: '8px',
          background: syncMessage.startsWith('✅') ? '#dcfce7' : '#fef3c7',
          color: syncMessage.startsWith('✅') ? '#166534' : '#92400e',
          fontSize: '14px'
        }}>
          {syncMessage}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="summary-cards">
          <div className="summary-card installation">
            <div className="card-icon">🔧</div>
            <div className="card-content">
              <span className="card-value">{summary.installation_count || 0}</span>
              <span className="card-label">Installations</span>
              <span className="card-sub">KSh {(summary.installation_bonus || 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="summary-card resolved">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <span className="card-value">{summary.resolved_count || 0}</span>
              <span className="card-label">Resolved Tickets</span>
              <span className="card-sub">KSh {(summary.resolved_bonus || 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="summary-card total">
            <div className="card-icon">💰</div>
            <div className="card-content">
              <span className="card-value">KSh {(summary.total_bonus_amount || 0).toLocaleString()}</span>
              <span className="card-label">Total Bonus</span>
              <span className="card-sub">{summary.total_tickets || 0} bonus tickets</span>
            </div>
          </div>
          <div className="summary-card paid">
            <div className="card-icon">💵</div>
            <div className="card-content">
              <span className="card-value">{summary.paid_count || 0}</span>
              <span className="card-label">Paid</span>
            </div>
          </div>
          <div className="summary-card pending">
            <div className="card-icon">⏳</div>
            <div className="card-content">
              <span className="card-value">{summary.pending_count || 0}</span>
              <span className="card-label">Pending</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters - compact inline bar */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
        padding: '12px 16px', marginBottom: '12px'
      }}>
        {/* Row 1: Quick date presets + date pickers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>📅</span>
          {[
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'this_week', label: 'This Week' },
            { key: 'last_week', label: 'Last Week' },
            { key: 'this_month', label: 'This Month' },
            { key: 'feb_2026', label: 'Feb 2026' },
            { key: 'all', label: 'All' },
          ].map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyDatePreset(p.key)}
              style={{
                padding: '5px 12px', fontSize: '12px', fontWeight: activePreset === p.key ? '700' : '500',
                border: activePreset === p.key ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                borderRadius: '16px', cursor: 'pointer',
                background: activePreset === p.key ? '#eef2ff' : '#fff',
                color: activePreset === p.key ? '#4f46e5' : '#64748b',
                transition: 'all 0.15s'
              }}
            >
              {p.label}
            </button>
          ))}

          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span>

          <input type="date" value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setActivePreset('custom'); }}
            style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', color: '#334155' }}
          />
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>to</span>
          <input type="date" value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setActivePreset('custom'); }}
            style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', color: '#334155' }}
          />

          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span>

          <select value={technician} onChange={(e) => setTechnician(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', color: '#334155', minWidth: '130px' }}
          >
            <option value="">All Technicians</option>
            {techniciansList.map(tech => (
              <option key={tech.id} value={tech.name}>{tech.name}</option>
            ))}
          </select>

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', color: '#334155' }}
          >
            <option value="">All Types</option>
            <option value="installation">Installation</option>
            <option value="resolved">Resolved</option>
          </select>

          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', color: '#334155' }}
          >
            <option value="">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>

          <button type="button" onClick={() => { setPagination(prev => ({ ...prev, offset: 0 })); fetchData(); }}
            style={{
              padding: '5px 14px', background: '#4f46e5', color: '#fff', border: 'none',
              borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
            }}
          >
            Go
          </button>

          {(technician || typeFilter || paymentStatus || activePreset !== 'custom') && (
            <button type="button" onClick={resetAllFilters}
              style={{
                padding: '5px 10px', background: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0',
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>⚠️ {error}</p>
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '0', borderBottom: '2px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('technicians')}
          style={{
            padding: '12px 24px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '600',
            background: activeTab === 'technicians' ? '#4f46e5' : 'transparent',
            color: activeTab === 'technicians' ? '#fff' : '#64748b',
            borderRadius: '8px 8px 0 0'
          }}
        >
          👥 Per Technician ({techBreakdown.length})
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          style={{
            padding: '12px 24px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '600',
            background: activeTab === 'tickets' ? '#4f46e5' : 'transparent',
            color: activeTab === 'tickets' ? '#fff' : '#64748b',
            borderRadius: '8px 8px 0 0'
          }}
        >
          🎫 All Bonus Tickets ({pagination.total})
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading bonus data...</p>
        </div>
      ) : (
        <>
          {/* ===== TECHNICIAN BREAKDOWN TAB ===== */}
          {activeTab === 'technicians' && (
            <div className="table-container" style={{ marginTop: '0' }}>
              <table className="bonus-table">
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Email</th>
                    <th>Installations</th>
                    <th>Resolved</th>
                    <th>Total Bonuses</th>
                    <th>Total Earned</th>
                    <th>Paid</th>
                    <th>Balance Owed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {techBreakdown.length === 0 ? (
                    <tr><td colSpan="9" className="empty-row">No bonus data for this period. Click "Sync Bonuses" to update.</td></tr>
                  ) : (
                    <>
                      {techBreakdown.map((tech) => (
                        <tr key={tech.id}>
                          <td><strong>{tech.name}</strong></td>
                          <td style={{ fontSize: '13px', color: '#64748b' }}>{tech.email}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="bonus-type-badge installation">{tech.installation_count}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="bonus-type-badge resolved">{tech.resolved_count}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: '600' }}>{tech.bonus_count}</td>
                          <td style={{ fontWeight: '700', color: '#16a34a' }}>KSh {tech.total_earned.toLocaleString()}</td>
                          <td style={{ color: '#2563eb' }}>KSh {tech.total_paid.toLocaleString()}</td>
                          <td style={{ fontWeight: '700', color: tech.balance_owed > 0 ? '#dc2626' : '#16a34a' }}>
                            KSh {tech.balance_owed.toLocaleString()}
                          </td>
                          <td>
                            {tech.balance_owed > 0 ? (
                              <button
                                onClick={() => openPayModal(tech)}
                                style={{
                                  padding: '6px 14px', background: '#16a34a', color: '#fff',
                                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                                  fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap'
                                }}
                              >
                                💵 Pay
                              </button>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '12px' }}>✓ Paid</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* Totals Row */}
                      <tr style={{ background: '#f1f5f9', fontWeight: '700', borderTop: '2px solid #cbd5e1' }}>
                        <td>TOTAL</td>
                        <td>{techBreakdown.length} technicians</td>
                        <td style={{ textAlign: 'center' }}>{techBreakdown.reduce((s, t) => s + t.installation_count, 0)}</td>
                        <td style={{ textAlign: 'center' }}>{techBreakdown.reduce((s, t) => s + t.resolved_count, 0)}</td>
                        <td style={{ textAlign: 'center' }}>{techBreakdown.reduce((s, t) => s + t.bonus_count, 0)}</td>
                        <td style={{ color: '#16a34a' }}>KSh {techBreakdown.reduce((s, t) => s + t.total_earned, 0).toLocaleString()}</td>
                        <td style={{ color: '#2563eb' }}>KSh {techBreakdown.reduce((s, t) => s + t.total_paid, 0).toLocaleString()}</td>
                        <td style={{ color: '#dc2626' }}>KSh {techBreakdown.reduce((s, t) => s + t.balance_owed, 0).toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== TICKET DETAIL TAB ===== */}
          {activeTab === 'tickets' && (
            <>
              <div className="table-container" style={{ marginTop: '0' }}>
                <table className="bonus-table">
                  <thead>
                    <tr>
                      <th>Ticket #</th>
                      <th>Date</th>
                      <th>Subject</th>
                      <th>Bonus Type</th>
                      <th>Technicians</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.length === 0 ? (
                      <tr><td colSpan="8" className="empty-row">No bonus-qualifying tickets found for this period.</td></tr>
                    ) : (
                      tickets.map((ticket, index) => (
                        <tr key={`${ticket.ticket_id}-${index}`}>
                          <td>
                            <Link to={`/admin/tickets/view/${ticket.ticket_id}`} className="ticket-link">
                              #{ticket.ticket_id}
                            </Link>
                          </td>
                          <td>{formatDate(ticket.completion_date)}</td>
                          <td className="subject-cell" title={ticket.subject}>
                            {ticket.subject?.length > 40 ? ticket.subject.substring(0, 40) + '...' : ticket.subject}
                          </td>
                          <td>
                            <span className={`bonus-type-badge ${ticket.bonus_type}`}>
                              {ticket.bonus_type === 'installation' ? '🔧 Install' : '✅ Resolved'}
                            </span>
                          </td>
                          <td className="technicians-cell">
                            {ticket.all_technicians?.length > 0 ? (
                              <div className="tech-list">
                                {ticket.all_technicians.map((tech, idx) => (
                                  <span key={idx} className="tech-tag">{tech}</span>
                                ))}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="amount-cell">
                            <span className="total-amount">KSh {(ticket.bonus_amount || 100).toLocaleString()}</span>
                            {ticket.technician_count > 1 && (
                              <span className="amount-breakdown">({ticket.technician_count} × 100)</span>
                            )}
                          </td>
                          <td>
                            <span className={`payment-badge ${ticket.payment_status}`}>
                              {ticket.payment_status === 'paid' ? '💵 Paid' : '⏳ Pending'}
                            </span>
                          </td>
                          <td className="actions-cell" style={{ display: 'flex', gap: '4px' }}>
                            {ticket.payment_status === 'pending' ? (
                              <button
                                onClick={() => openTicketPayModal(ticket)}
                                style={{
                                  padding: '5px 12px', background: '#16a34a', color: '#fff',
                                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                                  fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap'
                                }}
                              >
                                💵 Pay
                              </button>
                            ) : (
                              <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: '600' }}>✓ Paid</span>
                            )}
                            <button className="add-tech-btn" onClick={() => openAddTechnicianModal(ticket)} title="Add technician"
                              style={{ fontSize: '11px', padding: '5px 8px' }}
                            >
                              ➕
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button disabled={currentPage === 1} onClick={() => handlePageChange(0)}>First</button>
                  <button disabled={currentPage === 1} onClick={() => handlePageChange(pagination.offset - pagination.limit)}>Previous</button>
                  <span className="page-info">Page {currentPage} of {totalPages} ({pagination.total} total)</span>
                  <button disabled={currentPage === totalPages} onClick={() => handlePageChange(pagination.offset + pagination.limit)}>Next</button>
                  <button disabled={currentPage === totalPages} onClick={() => handlePageChange((totalPages - 1) * pagination.limit)}>Last</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Pay Modal */}
      {showPayModal && payingTech && (
        <div className="modal-overlay" onClick={closePayModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 Pay Technician Bonus</h3>
              <button className="modal-close" onClick={closePayModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="ticket-info">
                <p><strong>Technician:</strong> {payingTech.name}</p>
                <p><strong>Email:</strong> {payingTech.email}</p>
                <p><strong>Total Earned:</strong> <span style={{ color: '#16a34a', fontWeight: '700' }}>KSh {payingTech.total_earned.toLocaleString()}</span></p>
                <p><strong>Already Paid:</strong> <span style={{ color: '#2563eb' }}>KSh {payingTech.total_paid.toLocaleString()}</span></p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626', marginTop: '8px', padding: '8px 0', borderTop: '1px solid #e5e7eb' }}>
                  Balance to Pay: KSh {payingTech.balance_owed.toLocaleString()}
                </p>
              </div>
              
              {payError && <div className="modal-error">⚠️ {payError}</div>}
              {paySuccess && <div className="modal-success">{paySuccess}</div>}
              
              <form onSubmit={handlePay}>
                <div className="form-group">
                  <label htmlFor="payReference">Payment Reference (optional):</label>
                  <input
                    id="payReference"
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="e.g. M-Pesa code, bank ref..."
                    disabled={paying || paySuccess}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                      borderRadius: '8px', fontSize: '14px', marginTop: '4px'
                    }}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closePayModal} disabled={paying}>Cancel</button>
                  <button type="submit" className="btn-add" disabled={paying || paySuccess}
                    style={{ background: paying ? '#94a3b8' : '#16a34a' }}
                  >
                    {paying ? 'Processing...' : `💵 Pay KSh ${payingTech.balance_owed.toLocaleString()}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Per-Ticket Pay Modal */}
      {showTicketPayModal && payingTicket && (
        <div className="modal-overlay" onClick={closeTicketPayModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 Pay Ticket Bonus</h3>
              <button className="modal-close" onClick={closeTicketPayModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="ticket-info">
                <p><strong>Ticket:</strong> #{payingTicket.ticket_id}</p>
                <p><strong>Subject:</strong> {payingTicket.subject}</p>
                <p><strong>Type:</strong> {payingTicket.bonus_type === 'installation' ? '🔧 Installation' : '✅ Resolved'}</p>
                <p><strong>Date:</strong> {formatDate(payingTicket.completion_date)}</p>
                <p><strong>Technicians:</strong> {(payingTicket.all_technicians || []).join(', ')}</p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#16a34a', marginTop: '8px', padding: '8px 0', borderTop: '1px solid #e5e7eb' }}>
                  Amount: KSh {(payingTicket.bonus_amount || 0).toLocaleString()}
                </p>
              </div>
              
              {ticketPayError && <div className="modal-error">⚠️ {ticketPayError}</div>}
              {ticketPaySuccess && <div className="modal-success">{ticketPaySuccess}</div>}
              
              <form onSubmit={handleTicketPay}>
                <div className="form-group">
                  <label htmlFor="ticketPayRef">Payment Reference (optional):</label>
                  <input
                    id="ticketPayRef"
                    type="text"
                    value={ticketPayReference}
                    onChange={(e) => setTicketPayReference(e.target.value)}
                    placeholder="e.g. M-Pesa code, bank ref..."
                    disabled={payingTicketLoading || ticketPaySuccess}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                      borderRadius: '8px', fontSize: '14px', marginTop: '4px'
                    }}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeTicketPayModal} disabled={payingTicketLoading}>Cancel</button>
                  <button type="submit" className="btn-add" disabled={payingTicketLoading || ticketPaySuccess}
                    style={{ background: payingTicketLoading ? '#94a3b8' : '#16a34a' }}
                  >
                    {payingTicketLoading ? 'Processing...' : `💵 Pay KSh ${(payingTicket.bonus_amount || 0).toLocaleString()}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Technician Modal */}
      {showAddModal && selectedTicket && (
        <div className="modal-overlay" onClick={closeAddTechnicianModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Add Technician to Bonus</h3>
              <button className="modal-close" onClick={closeAddTechnicianModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="ticket-info">
                <p><strong>Ticket:</strong> #{selectedTicket.ticket_id}</p>
                <p><strong>Subject:</strong> {selectedTicket.subject}</p>
                <p><strong>Date:</strong> {formatDate(selectedTicket.completion_date)}</p>
                <p><strong>Currently Assigned:</strong> {(selectedTicket.all_technicians || []).join(', ') || '-'}</p>
              </div>
              
              {addError && <div className="modal-error">⚠️ {addError}</div>}
              {addSuccess && <div className="modal-success">{addSuccess}</div>}
              
              <form onSubmit={handleAddTechnician}>
                <div className="form-group">
                  <label htmlFor="technicianSelect">Select Technician / Engineer:</label>
                  {loadingTechnicians ? (
                    <p className="loading-text">Loading technicians...</p>
                  ) : (
                    <select
                      id="technicianSelect"
                      value={technicianToAdd}
                      onChange={(e) => setTechnicianToAdd(e.target.value)}
                      disabled={addingTechnician || addSuccess}
                      autoFocus
                    >
                      <option value="">-- Select a Technician --</option>
                      {techniciansList
                        .filter(tech => {
                          const currentlyAssigned = selectedTicket.all_technicians || [];
                          return !currentlyAssigned.some(
                            a => a.toLowerCase() === tech.email.toLowerCase() || a.toLowerCase() === tech.name.toLowerCase()
                          );
                        })
                        .map(tech => (
                          <option key={tech.id} value={tech.name}>
                            {tech.name} ({tech.email}) - {tech.roles || 'User'}
                          </option>
                        ))
                      }
                    </select>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeAddTechnicianModal} disabled={addingTechnician}>Cancel</button>
                  <button type="submit" className="btn-add" disabled={addingTechnician || addSuccess || !technicianToAdd.trim()}>
                    {addingTechnician ? 'Adding...' : 'Add Technician'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BonusSummary;
