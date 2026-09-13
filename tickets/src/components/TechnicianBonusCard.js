/**
 * TechnicianBonusCard.js - Reusable component for displaying technician bonus info
 * Shows daily installations, bonus earned, and payment status
 */

import React, { useState } from 'react';
import './TechnicianBonusCard.css';

const TechnicianBonusCard = ({
  technician,
  bonusData,
  onPayBonus,
  isAdmin = false,
  loading = false
}) => {
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (onPayBonus) {
      await onPayBonus({
        technicianEmail: technician.email,
        amount: amount,
        notes: paymentNotes
      });
      
      setPaymentAmount('');
      setPaymentNotes('');
      setShowPayDialog(false);
    }
  };

  if (!bonusData) {
    return (
      <div className="bonus-card loading">
        <p>Loading bonus information...</p>
      </div>
    );
  }

  const {
    today = {},
    total = {}
  } = bonusData;

  const installationsToday = today.installations_completed || 0;
  const otherTicketsToday = today.other_tickets_completed || 0;
  const installationBonus = today.installation_bonus || 0;
  const otherTicketsBonus = today.other_tickets_bonus || 0;
  const bonusEarned = today.bonus_amount || 0;
  const totalEarned = total.total_earned || 0;
  const totalPaid = total.total_paid || 0;
  const balanceOwed = total.balance_owed || 0;

  const isEarningInstallationBonus = installationsToday >= 5;
  const isEarningOtherTicketsBonus = otherTicketsToday > 10;
  const installationsRemaining = Math.max(0, 5 - installationsToday);
  const otherTicketsRemaining = Math.max(0, 11 - otherTicketsToday);

  const displayName =
    (technician && technician.name) ||
    `${technician?.first_name || ''} ${technician?.last_name || ''}`.trim() ||
    technician?.email ||
    'Technician';

  return (
    <div className="bonus-card">
      <div className="card-header">
        <h3 className="technician-name">
          {displayName}
        </h3>
        <span className="technician-email">{technician.email}</span>
      </div>

      <div className="card-content">
        {/* Today's Stats */}
        <div className="bonus-section today-section">
          <h4>Today's Performance</h4>
          
          {/* Installations */}
          <div className="bonus-subsection">
            <div className="stat-row">
              <span className="stat-label">📦 Installations:</span>
              <span className="stat-value">{installationsToday}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Installation Bonus:</span>
              <span className={`stat-value ${isEarningInstallationBonus ? 'earning' : ''}`}>
                KSh {installationBonus.toFixed(2)}
              </span>
            </div>
            {installationsRemaining > 0 && !isEarningInstallationBonus && (
              <div className="info-message small">
                <span>{installationsRemaining} more to start earning</span>
              </div>
            )}
            {isEarningInstallationBonus && (
              <div className="success-message small">
                <span>✓ Earning KSh 100/installation</span>
              </div>
            )}
          </div>

          {/* Other Tickets */}
          <div className="bonus-subsection">
            <div className="stat-row">
              <span className="stat-label">🎫 Other Tickets:</span>
              <span className="stat-value">{otherTicketsToday}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Other Tickets Bonus:</span>
              <span className={`stat-value ${isEarningOtherTicketsBonus ? 'earning' : ''}`}>
                KSh {otherTicketsBonus.toFixed(2)}
              </span>
            </div>
            {otherTicketsRemaining > 0 && !isEarningOtherTicketsBonus && (
              <div className="info-message small">
                <span>{otherTicketsRemaining} more to start earning</span>
              </div>
            )}
            {isEarningOtherTicketsBonus && (
              <div className="success-message small">
                <span>✓ Earning KSh 100/ticket</span>
              </div>
            )}
          </div>

          {/* Total Today */}
          <div className="stat-row total-row">
            <span className="stat-label">💵 Total Today:</span>
            <span className={`stat-value large ${bonusEarned > 0 ? 'earning' : ''}`}>
              KSh {bonusEarned.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Total Stats */}
        <div className="bonus-section total-section">
          <h4>Bonus Summary</h4>
          <div className="stat-row">
            <span className="stat-label">Total Earned:</span>
            <span className="stat-value">KSh {totalEarned.toFixed(2)}</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">Total Paid:</span>
            <span className="stat-value paid">KSh {totalPaid.toFixed(2)}</span>
          </div>

          <div className="stat-row balance">
            <span className="stat-label">Balance Owed:</span>
            <span className={`stat-value ${balanceOwed > 0 ? 'owed' : 'settled'}`}>
              KSh {balanceOwed.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Payment Section */}
      {isAdmin && balanceOwed > 0 && (
        <div className="card-footer admin-section">
          {!showPayDialog ? (
            <button
              className="btn btn-primary pay-bonus-btn"
              onClick={() => setShowPayDialog(true)}
              disabled={loading}
            >
              {loading ? 'Processing...' : `Pay KSh ${balanceOwed.toFixed(2)}`}
            </button>
          ) : (
            <form className="payment-form" onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label htmlFor="amount">Amount (KSh)</label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balanceOwed}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes (optional)</label>
                <input
                  id="notes"
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g., Bank transfer, Check #..."
                />
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={loading || !paymentAmount}
                >
                  {loading ? 'Processing...' : 'Confirm Payment'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowPayDialog(false);
                    setPaymentAmount('');
                    setPaymentNotes('');
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default TechnicianBonusCard;
