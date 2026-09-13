/**
 * BonusDashboard.js - Admin dashboard for managing technician bonuses
 * Shows all technicians' bonuses from February 2026 onwards
 * Uses V2 bonus API (ticket_bonus_records table)
 */

import React, { useState, useEffect } from 'react';
import BonusAPI from '../../helpers/BonusAPI';
import './BonusDashboard.css';

const BonusDashboard = () => {
  const [technicians, setTechnicians] = useState([]);
  const [overall, setOverall] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all, earning, pending

  // Default date range: Feb 1, 2026 to today
  const [startDate, setStartDate] = useState('2026-02-01');
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadBonusData();
  }, [startDate, endDate]);

  const loadBonusData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await BonusAPI.getStats(startDate, endDate);
      if (response.success) {
        setTechnicians(response.technicians || []);
        setOverall(response.overall || null);
        setDateRange(response.date_range || null);
      } else {
        setError(response.message || 'Failed to load bonuses');
      }
    } catch (err) {
      setError(err.message || 'Error loading bonuses');
      console.error('Error loading bonus data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTechnicians = technicians.filter((tech) => {
    if (filterStatus === 'earning') {
      return tech.total_earned > 0;
    }
    if (filterStatus === 'pending') {
      return tech.balance_owed > 0;
    }
    return true;
  });

  const totalEarned = technicians.reduce((sum, t) => sum + t.total_earned, 0);
  const totalPaid = technicians.reduce((sum, t) => sum + t.total_paid, 0);
  const totalOwed = technicians.reduce((sum, t) => sum + t.balance_owed, 0);

  return (
    <div className="bonus-dashboard">
      <div className="dashboard-header">
        <h1>Technician Bonus Dashboard</h1>
        <p className="subtitle">Track and manage technician bonus payments (from Feb 2026)</p>
      </div>

      {/* Date Range Filter */}
      <div className="date-filter" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '13px', marginRight: '4px' }}>From:</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc' }} />
        </div>
        <div>
          <label style={{ fontSize: '13px', marginRight: '4px' }}>To:</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc' }} />
        </div>
      </div>

      {/* Summary Cards */}
      {overall && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">👥</div>
            <div className="summary-content">
              <h3>Technicians</h3>
              <p className="summary-value">{technicians.length}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">🎫</div>
            <div className="summary-content">
              <h3>Qualifying Tickets</h3>
              <p className="summary-value">{overall.total_qualifying_tickets}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">💰</div>
            <div className="summary-content">
              <h3>Total Earned</h3>
              <p className="summary-value">KSh {totalEarned.toLocaleString()}</p>
            </div>
          </div>

          <div className="summary-card total-owed">
            <div className="summary-icon">💳</div>
            <div className="summary-content">
              <h3>Balance Owed</h3>
              <p className="summary-value">KSh {totalOwed.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="alert alert-error">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)} className="alert-close">×</button>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="alert alert-success">
          <span>✓ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="alert-close">×</button>
        </div>
      )}

      {/* Filter Section */}
      <div className="filter-section">
        <h3>Filter Technicians</h3>
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All Technicians ({technicians.length})
          </button>
          <button
            className={`filter-btn ${filterStatus === 'earning' ? 'active' : ''}`}
            onClick={() => setFilterStatus('earning')}
          >
            Earning Bonus ({technicians.filter(t => t.total_earned > 0).length})
          </button>
          <button
            className={`filter-btn ${filterStatus === 'pending' ? 'active' : ''}`}
            onClick={() => setFilterStatus('pending')}
          >
            Pending Payment ({technicians.filter(t => t.balance_owed > 0).length})
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading technician bonuses...</p>
        </div>
      ) : filteredTechnicians.length === 0 ? (
        <div className="empty-state">
          <p>No technicians found for the selected filter</p>
        </div>
      ) : (
        <div className="bonuses-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filteredTechnicians.map((tech) => (
            <div key={tech.id} className="tech-bonus-card" style={{
              background: '#fff',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              overflow: 'hidden'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: '#fff',
                padding: '16px 20px'
              }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{tech.name}</h3>
                <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '13px' }}>{tech.email}</p>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Bonus Tickets:</span>
                  <strong>{tech.bonus_count}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Total Earned:</span>
                  <strong style={{ color: '#16a34a' }}>KSh {tech.total_earned.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Total Paid:</span>
                  <strong style={{ color: '#2563eb' }}>KSh {tech.total_paid.toLocaleString()}</strong>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0 0',
                  borderTop: '1px solid #eee'
                }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Balance Owed:</span>
                  <strong style={{ color: tech.balance_owed > 0 ? '#dc2626' : '#16a34a', fontSize: '16px' }}>
                    KSh {tech.balance_owed.toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh Button */}
      <div className="action-buttons">
        <button 
          className="btn btn-refresh" 
          onClick={loadBonusData}
          disabled={loading}
        >
          🔄 Refresh Data
        </button>
      </div>
    </div>
  );
};

export default BonusDashboard;
