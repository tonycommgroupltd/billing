/**
 * BonusPaymentHistory.js - Admin page showing all bonus payment history
 * Displays payment logs with filtering and pagination
 */

import React, { useState, useEffect } from 'react';
import BonusAPI from '../../helpers/BonusAPI';
import './BonusPaymentHistory.css';

const BonusPaymentHistory = () => {
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterName, setFilterName] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('date_desc');

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    loadPaymentHistory();
  }, [currentPage, filterName]);

  const loadPaymentHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const response = await BonusAPI.getPaymentHistory(
        filterName || null,
        ITEMS_PER_PAGE,
        offset
      );

      if (response.success) {
        // Sort payments if needed
        let sortedPayments = response.payments || [];
        if (sortBy === 'date_desc') {
          sortedPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortBy === 'date_asc') {
          sortedPayments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        } else if (sortBy === 'amount_desc') {
          sortedPayments.sort((a, b) => b.amount - a.amount);
        } else if (sortBy === 'amount_asc') {
          sortedPayments.sort((a, b) => a.amount - b.amount);
        }

        setPayments(sortedPayments);
        setTotal(response.total || 0);
      } else {
        setError(response.message || 'Failed to load payment history');
      }
    } catch (err) {
      setError(err.message || 'Error loading payment history');
      console.error('Error loading payment history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilterName(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const totalAmountPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  return (
    <div className="bonus-payment-history">
      <div className="history-header">
        <h1>Bonus Payment History</h1>
        <p className="subtitle">Track all technician bonus payments</p>
      </div>

      {/* Summary Card */}
      {payments.length > 0 && (
        <div className="history-summary">
          <div className="summary-stat">
            <span className="stat-label">Total Payments on Page</span>
            <span className="stat-value">KSh {totalAmountPaid.toFixed(2)}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Payment Count</span>
            <span className="stat-value">{payments.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Average Amount</span>
            <span className="stat-value">KSh {(totalAmountPaid / payments.length).toFixed(2)}</span>
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

      {/* Filter Section */}
      <div className="filter-section">
        <div className="filter-group">
          <label htmlFor="name-filter">Filter by Technician Name:</label>
          <input
            id="name-filter"
            type="text"
            placeholder="Enter technician name"
            value={filterName}
            onChange={handleFilterChange}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="sort-by">Sort by:</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={handleSortChange}
            className="filter-select"
          >
            <option value="date_desc">Date (Newest First)</option>
            <option value="date_asc">Date (Oldest First)</option>
            <option value="amount_desc">Amount (Highest First)</option>
            <option value="amount_asc">Amount (Lowest First)</option>
          </select>
        </div>

        <div className="filter-info">
          <p>Total Records: <strong>{total}</strong></p>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading payment history...</p>
        </div>
      ) : payments.length === 0 ? (
        <div className="empty-state">
          <p>No payments found</p>
          {filterName && <p className="empty-note">Try adjusting your filters</p>}
        </div>
      ) : (
        <>
          {/* Payment Table */}
          <div className="table-container">
            <table className="payment-table">
              <thead>
                <tr>
                  <th>Reference #</th>
                  <th>Technician</th>
                  <th>Amount</th>
                  <th>Payment Date</th>
                  <th>Paid By</th>
                  <th>Method</th>
                  <th>Notes</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="payment-row">
                    <td className="reference-cell">
                      <span className="reference-badge">{payment.reference_number}</span>
                    </td>
                    <td className="email-cell">
                      <div className="email-info">
                        {payment.technician_name && (
                          <span className="email-text">{payment.technician_name}</span>
                        )}
                        <span className="email-text">{payment.technician_email}</span>
                      </div>
                    </td>
                    <td className="amount-cell">
                      <span className="amount-badge">KSh {parseFloat(payment.amount).toFixed(2)}</span>
                    </td>
                    <td className="date-cell">
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </td>
                    <td className="admin-cell">
                      <span className="admin-name">
                        {payment.admin_name || '-'}
                      </span>
                      <span className="admin-email">{payment.paid_by_email}</span>
                    </td>
                    <td className="method-cell">
                      <span className={`method-badge method-${payment.payment_method}`}>
                        {payment.payment_method || 'N/A'}
                      </span>
                    </td>
                    <td className="notes-cell">
                      <span className="notes-text" title={payment.notes || 'No notes'}>
                        {payment.notes ? payment.notes.substring(0, 30) + '...' : '-'}
                      </span>
                    </td>
                    <td className="created-cell">
                      <span className="created-date">
                        {new Date(payment.created_at).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pag-btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                First
              </button>
              <button
                className="pag-btn"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>

              <div className="pag-info">
                Page {currentPage} of {totalPages}
              </div>

              <button
                className="pag-btn"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
              <button
                className="pag-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BonusPaymentHistory;
