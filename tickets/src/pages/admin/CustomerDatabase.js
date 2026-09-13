/**
 * CustomerDatabase.js - Customer database viewer with CSV export
 * Shows all customers from the database with search, filter, and download
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { formatTicketDateVeryShort, getTimeAgo } from '../../utils/dateUtils';

const API_BASE_URL = process.env.REACT_APP_API_URL || `${window.location.origin}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') ||
                localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const CustomerDatabase = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('ASC');
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 0 });
  
  // Expanded row
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        action: 'list',
        page: page,
        per_page: perPage,
        sort_by: sortBy,
        sort_dir: sortDir
      });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);

      const response = await axios.get(
        `${API_BASE_URL}/customer-export.php?${params.toString()}`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      
      if (response.data.success) {
        setCustomers(response.data.data || []);
        setPagination(response.data.pagination || { total: 0, total_pages: 0 });
      } else {
        setError(response.data.message || 'Failed to load customers');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sortBy, sortDir, search, statusFilter]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/customer-export.php?action=stats`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortDir('ASC');
    }
    setPage(1);
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({ action: 'export' });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);

      const response = await axios.get(
        `${API_BASE_URL}/customer-export.php?${params.toString()}`,
        { 
          headers: getAuthHeaders(), 
          withCredentials: true,
          responseType: 'blob'
        }
      );
      
      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return '↕';
    return sortDir === 'ASC' ? '↑' : '↓';
  };

  const styles = {
    page: { padding: '24px', maxWidth: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
    title: { margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e293b' },
    subtitle: { margin: '4px 0 0', color: '#64748b', fontSize: '14px' },
    statsRow: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
    statCard: { flex: '1', minWidth: '140px', background: '#fff', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textAlign: 'center' },
    statValue: { fontSize: '28px', fontWeight: '700', color: '#4f46e5' },
    statLabel: { fontSize: '13px', color: '#64748b', marginTop: '4px' },
    filters: { display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' },
    input: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', minWidth: '200px' },
    select: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff' },
    btn: { padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
    btnPrimary: { background: '#4f46e5', color: '#fff' },
    btnSuccess: { background: '#16a34a', color: '#fff' },
    btnDisabled: { background: '#94a3b8', color: '#fff', cursor: 'wait' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
    th: { padding: '12px 14px', textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' },
    td: { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#334155' },
    badge: (color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', background: color === 'green' ? '#dcfce7' : '#fef3c7', color: color === 'green' ? '#166534' : '#92400e' }),
    pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px' },
    pageBtn: { padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '13px' },
    pageBtnActive: { background: '#4f46e5', color: '#fff', border: '1px solid #4f46e5' },
    expandedRow: { background: '#f8fafc', padding: '12px 20px' },
    serviceTag: { display: 'inline-block', margin: '2px 4px', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', background: '#e0e7ff', color: '#3730a3' },
    empty: { textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '16px' },
    loading: { textAlign: 'center', padding: '40px', color: '#64748b' },
    error: { padding: '12px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', marginBottom: '16px' }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📋 Customer Database</h1>
          <p style={styles.subtitle}>View and download all customer details</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          style={{ ...styles.btn, ...(exporting ? styles.btnDisabled : styles.btnSuccess), display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px' }}
        >
          {exporting ? '⏳ Exporting...' : '📥 Download CSV'}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.total?.toLocaleString()}</div>
            <div style={styles.statLabel}>Total Customers</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#16a34a' }}>{stats.active?.toLocaleString()}</div>
            <div style={styles.statLabel}>Active</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#f59e0b' }}>{stats.inactive?.toLocaleString()}</div>
            <div style={styles.statLabel}>Inactive</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#8b5cf6' }}>{stats.new_this_month?.toLocaleString()}</div>
            <div style={styles.statLabel}>New This Month</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#0ea5e9' }}>{stats.with_services?.toLocaleString()}</div>
            <div style={styles.statLabel}>With Services</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleSearch} style={styles.filters}>
        <input
          type="text"
          placeholder="Search name, phone, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.input}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button type="submit" style={{ ...styles.btn, ...styles.btnPrimary }}>🔍 Search</button>
        <span style={{ fontSize: '13px', color: '#94a3b8', alignSelf: 'center' }}>
          {pagination.total?.toLocaleString()} customers found
        </span>
      </form>

      {/* Error */}
      {error && <div style={styles.error}>⚠️ {error}</div>}

      {/* Loading */}
      {loading ? (
        <div style={styles.loading}>
          <p>Loading customers...</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th} onClick={() => handleSort('id')}>ID {sortIcon('id')}</th>
                  <th style={styles.th} onClick={() => handleSort('name')}>Name {sortIcon('name')}</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th} onClick={() => handleSort('address')}>Address {sortIcon('address')}</th>
                  <th style={styles.th} onClick={() => handleSort('location')}>Location {sortIcon('location')}</th>
                  <th style={styles.th} onClick={() => handleSort('status')}>Status {sortIcon('status')}</th>
                  <th style={styles.th}>Plan(s)</th>
                  <th style={styles.th}>Balance</th>
                  <th style={styles.th} onClick={() => handleSort('created_at')}>Created {sortIcon('created_at')}</th>
                  <th style={styles.th} onClick={() => handleSort('updated_at')}>Updated {sortIcon('updated_at')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan="11" style={styles.empty}>No customers found</td></tr>
                ) : (
                  customers.map((cust) => (
                    <React.Fragment key={cust.id}>
                      <tr 
                        onClick={() => setExpandedRow(expandedRow === cust.id ? null : cust.id)}
                        style={{ cursor: 'pointer', background: expandedRow === cust.id ? '#f0f4ff' : 'transparent' }}
                      >
                        <td style={styles.td}>{cust.id}</td>
                        <td style={{ ...styles.td, fontWeight: '600' }}>{cust.name}</td>
                        <td style={styles.td}>{cust.phone_number || '-'}</td>
                        <td style={{ ...styles.td, fontSize: '13px', color: '#64748b' }}>{cust.email || '-'}</td>
                        <td style={{ ...styles.td, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cust.address}>{cust.address || '-'}</td>
                        <td style={styles.td}>{cust.location || cust.city || '-'}</td>
                        <td style={styles.td}>
                          <span style={styles.badge(cust.status === 'active' ? 'green' : 'yellow')}>
                            {cust.status || 'unknown'}
                          </span>
                        </td>
                        <td style={styles.td}>{cust.plans || '-'}</td>
                        <td style={{ ...styles.td, fontWeight: '600', color: cust.balance > 0 ? '#16a34a' : cust.balance < 0 ? '#dc2626' : '#64748b' }}>
                          {cust.balance !== 0 ? `KSh ${cust.balance.toLocaleString()}` : '-'}
                        </td>
                        <td style={{ ...styles.td, fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {(cust.ticket_created_at || cust.created_at) ? (
                            <>
                              <div>{formatTicketDateVeryShort(cust.ticket_created_at || cust.created_at)}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{getTimeAgo(cust.ticket_created_at || cust.created_at)}</div>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ ...styles.td, fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {(cust.ticket_updated_at || cust.updated_at) ? (
                            <>
                              <div>{formatTicketDateVeryShort(cust.ticket_updated_at || cust.updated_at)}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{getTimeAgo(cust.ticket_updated_at || cust.updated_at)}</div>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                      {/* Expanded details row */}
                      {expandedRow === cust.id && (
                        <tr>
                          <td colSpan="11" style={styles.expandedRow}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                              <div><strong>Referral Code:</strong> {cust.referral_code || '-'}</div>
                              <div><strong>Coordinates:</strong> {cust.latitude && cust.longitude ? `${cust.latitude}, ${cust.longitude}` : '-'}</div>
                              <div><strong>Notes:</strong> {cust.notes || '-'}</div>
                              <div><strong>Last Updated:</strong> {cust.updated_at ? new Date(cust.updated_at).toLocaleString() : '-'}</div>
                              <div style={{ gridColumn: '1 / -1' }}>
                                <strong>Services:</strong>{' '}
                                {cust.services && cust.services.length > 0 ? (
                                  cust.services.map((svc, i) => (
                                    <span key={i} style={styles.serviceTag}>
                                      {svc.plan || 'Custom'} {svc.ip ? `(${svc.ip})` : ''} — {svc.status_label || 'Unknown'} {svc.online ? '🟢' : '🔴'}
                                    </span>
                                  ))
                                ) : 'No services'}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div style={styles.pagination}>
              <button
                disabled={page === 1}
                onClick={() => setPage(1)}
                style={{ ...styles.pageBtn, opacity: page === 1 ? 0.5 : 1 }}
              >First</button>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ ...styles.pageBtn, opacity: page === 1 ? 0.5 : 1 }}
              >← Prev</button>
              <span style={{ fontSize: '14px', color: '#475569' }}>
                Page {page} of {pagination.total_pages} ({pagination.total.toLocaleString()} total)
              </span>
              <button
                disabled={page >= pagination.total_pages}
                onClick={() => setPage(p => p + 1)}
                style={{ ...styles.pageBtn, opacity: page >= pagination.total_pages ? 0.5 : 1 }}
              >Next →</button>
              <button
                disabled={page >= pagination.total_pages}
                onClick={() => setPage(pagination.total_pages)}
                style={{ ...styles.pageBtn, opacity: page >= pagination.total_pages ? 0.5 : 1 }}
              >Last</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CustomerDatabase;
