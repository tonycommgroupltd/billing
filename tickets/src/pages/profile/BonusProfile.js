import React, { useState, useEffect, useRef } from 'react';
import BonusAPI from '../../helpers/BonusAPI';
import './BonusProfile.css';

const BonusProfile = ({ userEmail }) => {
  const [bonusData, setBonusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isLoadingRef = useRef(false);
  const lastEmailRef = useRef(null);

  const loadBonusData = async (forceRefresh = false) => {
    // Prevent duplicate calls
    if (isLoadingRef.current && !forceRefresh) {
      return;
    }
    
    // Prevent re-fetching for same email unless forced
    if (!forceRefresh && lastEmailRef.current === userEmail && bonusData) {
      return;
    }

    if (!userEmail) {
      setError('User email is required');
      setLoading(false);
      return;
    }

    try {
      isLoadingRef.current = true;
      lastEmailRef.current = userEmail;
      setLoading(true);
      setError(null);
      
      console.log('Loading bonus data for:', userEmail);
      
      const response = await BonusAPI.getTechnicianBonus(userEmail);
      console.log('Bonus API response:', response);
      
      if (response && response.success) {
        setBonusData(response);
      } else {
        setError(response?.message || 'Failed to load bonus information');
        console.error('API error:', response);
      }
    } catch (err) {
      setError(err.message || 'Error loading bonus data');
      console.error('Error loading technician bonus:', err);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    loadBonusData();
    const interval = setInterval(() => loadBonusData(true), 30000);
    return () => clearInterval(interval);
  }, [userEmail]);

  const handleRefresh = () => {
    loadBonusData();
  };

  if (loading) {
    return (
      <div className="bonus-profile loading">
        <div className="loading-spinner">
          <p>Loading bonus information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bonus-profile error">
        <div className="error-message">
          <h3>Error Loading Bonus Data</h3>
          <p>{error}</p>
          <button onClick={handleRefresh} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!bonusData) {
    return (
      <div className="bonus-profile no-data">
        <div className="no-data-message">
          <h3>No Bonus Data Available</h3>
          <p>No bonus information found for {userEmail}</p>
          <button onClick={handleRefresh} className="refresh-button">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const today = bonusData.today || {};
  const total = bonusData.total || {};

  return (
    <div className="bonus-profile">
      <div className="bonus-header">
        <h2>Technician Bonus Summary</h2>
        <button onClick={handleRefresh} className="refresh-button">
          Refresh Data
        </button>
      </div>

      <div className="bonus-section today-stats">
        <h3>Today's Performance</h3>
        <div className="stats-grid">
          <div className="stat-card installations">
            <div className="stat-icon">🏠</div>
            <div className="stat-details">
              <span className="stat-value">{today.installations_completed || 0}</span>
              <span className="stat-label">Installations Completed</span>
              <span className="stat-bonus">
                +KSh {(today.installation_bonus || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="stat-card other-tickets">
            <div className="stat-icon">🎫</div>
            <div className="stat-details">
              <span className="stat-value">{today.other_tickets_completed || 0}</span>
              <span className="stat-label">Other Tickets</span>
              <span className="stat-bonus">
                +KSh {(today.other_tickets_bonus || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="stat-card total-today">
            <div className="stat-icon">💰</div>
            <div className="stat-details">
              <span className="stat-value">KSh {(today.bonus_amount || 0).toFixed(2)}</span>
              <span className="stat-label">Today's Total Bonus</span>
              <span className={`award-status ${today.bonus_awarded ? 'awarded' : 'pending'}`}>
                {today.bonus_awarded ? 'Awarded' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bonus-section total-stats">
        <h3>Total Performance</h3>
        <div className="stats-grid">
          <div className="stat-card total-earned">
            <div className="stat-icon">📈</div>
            <div className="stat-details">
              <span className="stat-value">KSh {(total.total_earned || 0).toFixed(2)}</span>
              <span className="stat-label">Total Earned</span>
            </div>
          </div>

          <div className="stat-card total-paid">
            <div className="stat-icon">💳</div>
            <div className="stat-details">
              <span className="stat-value">KSh {(total.total_paid || 0).toFixed(2)}</span>
              <span className="stat-label">Total Paid</span>
            </div>
          </div>

          <div className="stat-card balance-owed">
            <div className="stat-icon">⚖️</div>
            <div className="stat-details">
              <span className="stat-value">KSh {(total.balance_owed || 0).toFixed(2)}</span>
              <span className="stat-label">Balance Owed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bonus-section bonus-rules">
        <h3>Bonus Rules</h3>
        <div className="rules-grid">
          <div className="rule-card">
            <div className="rule-header">Installation Bonus</div>
            <div className="rule-details">
              <p>• 5+ installations/day = KSh 100 per installation (after 4th)</p>
              <p>• Less than 5 installations = No bonus</p>
            </div>
          </div>
          <div className="rule-card">
            <div className="rule-header">Resolved Ticket Bonus</div>
            <div className="rule-details">
              <p>• 11+ resolved tickets/day = KSh 100 per ticket (after 10th)</p>
              <p>• Less than 11 resolved = No bonus</p>
            </div>
          </div>
        </div>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="bonus-section debug-info">
          <h3>Debug Information</h3>
          <details>
            <summary>Raw API Response</summary>
            <pre>{JSON.stringify(bonusData, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default React.memo(BonusProfile);