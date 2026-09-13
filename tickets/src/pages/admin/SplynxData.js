/**
 * SplynxData.js - Live Customer Services from Splynx
 * Shows: Customer Name, Phone, City, Status, Plan, Price, Balance, Bill To
 * Filters: Status (Active/Disabled/Expired), Has Balance, Search
 * Export: Download filtered results as Excel/CSV
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || `${window.location.origin}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') ||
                localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Status badge color mapping
const statusColors = {
  'Active': { bg: '#d4edda', color: '#155724' },
  'Expired': { bg: '#f8d7da', color: '#721c24' },
  'Disabled': { bg: '#e2e3e5', color: '#383d41' },
};

const getStatusStyle = (status) => {
  const s = statusColors[status] || { bg: '#e2e3e5', color: '#383d41' };
  return {
    display: 'inline-block', background: s.bg, color: s.color,
    padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600'
  };
};

const formatDate = (d) => {
  if (!d) return '';
  return d.substring(0, 10);
};

const SplynxData = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ active: 0, expired: 0, disabled: 0, with_balance: 0, negative_balance: 0 });
  const [message, setMessage] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadServices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, per_page: 100 });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (balanceFilter) params.append('has_balance', balanceFilter);

      const res = await axios.get(`${API_BASE_URL}/splynx-services?${params}`, {
        headers: getAuthHeaders()
      });
      if (res.data?.data) {
        setServices(res.data.data);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.total_pages || 0);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (e) {
      console.error('Load error:', e);
      setMessage({ type: 'error', text: 'Failed to load services: ' + (e.response?.data?.message || e.message) });
    }
    setLoading(false);
  }, [search, statusFilter, balanceFilter, page]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') { setPage(1); }
  };

  const applyStatusFilter = (s) => {
    setStatusFilter(prev => prev === s ? '' : s);
    setPage(1);
  };

  const applyBalanceFilter = (b) => {
    setBalanceFilter(prev => prev === b ? '' : b);
    setPage(1);
  };

  // Export CSV via PHP proxy
  const downloadExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ action: 'export' });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') ||
                    localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (token) params.append('token', token);
      window.open(`${API_BASE_URL}/splynx-services?${params}`, '_blank');
    } catch (e) {
      setMessage({ type: 'error', text: 'Export failed' });
    }
    setExporting(false);
  };

  // ===================== STYLES =====================
  const styles = {
    page: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
    card: {
      background: '#fff', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
      padding: '24px', marginBottom: '20px'
    },
    title: { fontSize: '22px', fontWeight: '700', color: '#1a1a2e', marginBottom: '4px' },
    subtitle: { fontSize: '14px', color: '#888', marginBottom: '20px' },
    statsRow: {
      display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap'
    },
    statCard: (bg, color, active) => ({
      padding: '12px 20px', borderRadius: '10px', cursor: 'pointer',
      background: active ? color : bg, color: active ? '#fff' : color,
      fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
      border: `2px solid ${active ? color : 'transparent'}`,
      userSelect: 'none'
    }),
    toolbar: {
      display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px',
      flexWrap: 'wrap'
    },
    searchInput: {
      flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid #ddd',
      borderRadius: '8px', fontSize: '14px', outline: 'none'
    },
    btn: (color) => ({
      padding: '10px 20px', borderRadius: '8px', border: 'none',
      background: color, color: '#fff', fontSize: '14px', fontWeight: '600',
      cursor: 'pointer', whiteSpace: 'nowrap'
    }),
    alert: (type) => ({
      padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
      background: type === 'success' ? '#d4edda' : '#f8d7da',
      color: type === 'success' ? '#155724' : '#721c24',
      border: `1px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
    }),
    tableWrap: { overflowX: 'auto' },
    table: {
      width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1100px'
    },
    th: {
      textAlign: 'left', padding: '10px 12px', background: '#f8f9fa',
      borderBottom: '2px solid #e9ecef', fontWeight: '600', color: '#495057',
      whiteSpace: 'nowrap'
    },
    td: {
      padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#333'
    },
    paging: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 0', fontSize: '14px', color: '#666'
    },
    pageBtn: (disabled) => ({
      padding: '8px 16px', borderRadius: '6px', border: '1px solid #ddd',
      background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#ccc' : '#333',
      cursor: disabled ? 'default' : 'pointer', fontSize: '13px'
    })
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>📋 Customer Services</h2>
      <p style={styles.subtitle}>Live data from Splynx — {total.toLocaleString()} total services</p>

      {message && (
        <div style={styles.alert(message.type)}>
          {message.text}
          <span style={{ float: 'right', cursor: 'pointer' }} onClick={() => setMessage(null)}>✕</span>
        </div>
      )}

      {/* Stats Cards (clickable filters) */}
      <div style={styles.statsRow}>
        <div
          style={styles.statCard('#e8f0fe', '#4361ee', false)}
          onClick={() => { setStatusFilter(''); setBalanceFilter(''); setPage(1); }}
        >
          📡 All: {total.toLocaleString()}
        </div>
        <div
          style={styles.statCard('#d4edda', '#155724', statusFilter === 'Active')}
          onClick={() => applyStatusFilter('Active')}
        >
          ✅ Active: {stats.active}
        </div>
        <div
          style={styles.statCard('#f8d7da', '#721c24', statusFilter === 'Expired')}
          onClick={() => applyStatusFilter('Expired')}
        >
          ⏰ Expired: {stats.expired}
        </div>
        <div
          style={styles.statCard('#e2e3e5', '#383d41', statusFilter === 'Disabled')}
          onClick={() => applyStatusFilter('Disabled')}
        >
          🚫 Disabled: {stats.disabled}
        </div>
        <div
          style={styles.statCard('#fff3cd', '#856404', balanceFilter === 'yes')}
          onClick={() => applyBalanceFilter('yes')}
        >
          💰 With Balance: {stats.with_balance}
        </div>
        <div
          style={styles.statCard('#fce4ec', '#c62828', balanceFilter === 'negative')}
          onClick={() => applyBalanceFilter('negative')}
        >
          📉 Negative Balance: {stats.negative_balance}
        </div>
      </div>

      <div style={styles.card}>
        {/* Search + Export toolbar */}
        <div style={styles.toolbar}>
          <input
            type="text"
            placeholder="Search by name, phone, plan, or PPPoE username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            style={styles.searchInput}
          />
          <button onClick={() => { setPage(1); loadServices(); }} style={styles.btn('#4361ee')}>
            🔍 Search
          </button>
          <button onClick={downloadExcel} disabled={exporting} style={styles.btn('#28a745')}>
            {exporting ? '⏳ Exporting...' : '📥 Download Excel'}
          </button>
        </div>

        {/* Active filters summary */}
        {(statusFilter || balanceFilter) && (
          <div style={{ marginBottom: '12px', fontSize: '13px', color: '#666' }}>
            Filters:
            {statusFilter && (
              <span style={{
                display: 'inline-block', background: '#e8f0fe', padding: '2px 10px',
                borderRadius: '12px', margin: '0 6px', fontWeight: '600'
              }}>
                Status: {statusFilter}
                <span style={{ cursor: 'pointer', marginLeft: '6px' }} onClick={() => { setStatusFilter(''); setPage(1); }}>✕</span>
              </span>
            )}
            {balanceFilter && (
              <span style={{
                display: 'inline-block', background: '#fff3cd', padding: '2px 10px',
                borderRadius: '12px', margin: '0 6px', fontWeight: '600'
              }}>
                Balance: {balanceFilter === 'yes' ? 'Positive' : 'Negative'}
                <span style={{ cursor: 'pointer', marginLeft: '6px' }} onClick={() => { setBalanceFilter(''); setPage(1); }}>✕</span>
              </span>
            )}
            <span style={{ cursor: 'pointer', color: '#4361ee', marginLeft: '8px' }}
                  onClick={() => { setStatusFilter(''); setBalanceFilter(''); setSearch(''); setPage(1); }}>
              Clear all
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            Loading services...
          </div>
        ) : (
          <>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: '50px' }}>#</th>
                    <th style={styles.th}>Customer</th>
                    <th style={{ ...styles.th, width: '110px' }}>Phone</th>
                    <th style={{ ...styles.th, width: '100px' }}>City</th>
                    <th style={{ ...styles.th, width: '90px' }}>Status</th>
                    <th style={styles.th}>Plan</th>
                    <th style={{ ...styles.th, width: '90px' }}>Price</th>
                    <th style={{ ...styles.th, width: '100px' }}>Balance</th>
                    <th style={{ ...styles.th, width: '100px' }}>Bill To</th>
                    <th style={{ ...styles.th, width: '100px' }}>PPPoE</th>
                  </tr>
                </thead>
                <tbody>
                  {services.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ ...styles.td, textAlign: 'center', color: '#999', padding: '30px' }}>
                        No services found
                      </td>
                    </tr>
                  ) : (
                    services.map((s, idx) => {
                      const statusLabel = s.status?.label || (typeof s.status === 'string' ? s.status : 'Unknown');
                      const balance = Number(s.balance) || 0;
                      return (
                        <tr key={`${s.service_id}-${idx}`}
                            style={{
                              transition: 'background 0.15s',
                              background: balance < 0 ? '#fff5f5' : 'transparent'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = balance < 0 ? '#ffe0e0' : '#f8f9ff'}
                            onMouseLeave={(e) => e.currentTarget.style.background = balance < 0 ? '#fff5f5' : 'transparent'}>
                          <td style={{ ...styles.td, color: '#999', fontSize: '12px' }}>
                            {(page - 1) * 100 + idx + 1}
                          </td>
                          <td style={{ ...styles.td, fontWeight: '600' }}>{s.customer_name}</td>
                          <td style={styles.td}>{s.phone_number || ''}</td>
                          <td style={styles.td}>{s.city || ''}</td>
                          <td style={styles.td}>
                            <span style={getStatusStyle(statusLabel)}>{statusLabel}</span>
                          </td>
                          <td style={styles.td}>{s.plan_name || ''}</td>
                          <td style={styles.td}>
                            {s.price > 0 ? `${Number(s.price).toLocaleString()}` : '0'}
                          </td>
                          <td style={{
                            ...styles.td,
                            fontWeight: '600',
                            color: balance > 0 ? '#155724' : balance < 0 ? '#dc3545' : '#666'
                          }}>
                            {balance !== 0 ? balance.toLocaleString() : '0'}
                          </td>
                          <td style={styles.td}>{formatDate(s.bill_to)}</td>
                          <td style={{ ...styles.td, fontSize: '12px', color: '#666' }}>{s.mikrotik_name || ''}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={styles.paging}>
                <span>
                  Page {page} of {totalPages} · {total.toLocaleString()} total
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={styles.pageBtn(page <= 1)}
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    ← Previous
                  </button>
                  <button
                    style={styles.pageBtn(page >= totalPages)}
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SplynxData;
