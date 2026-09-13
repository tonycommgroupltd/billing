import moment from 'moment';

/** Ticket last activity time (same as dashboard / list Updated column). */
export const getActivityTime = (c) => {
  const raw = c.ticket_updated_at || c.updated_at;
  return raw ? moment(raw) : null;
};

export const isInstallationComplete = (c) =>
  Boolean(c.ticketStatus && c.ticketStatus.toLowerCase() === 'installation complete');

export const DASHBOARD_METRICS = {
  posted: {
    label: 'Total Posted',
    description: 'All customers you have posted',
  },
  completed: {
    label: 'Total Completed',
    description: 'Installations marked complete',
  },
  completed_today: {
    label: 'Completed Today',
    description: 'Completed today (by ticket last update)',
  },
  completed_month: {
    label: 'Completed This Month',
    description: 'Completed this month (by ticket last update)',
  },
};

export function parseMetricFromSearch(search) {
  const metric = new URLSearchParams(search).get('metric');
  return metric && DASHBOARD_METRICS[metric] ? metric : null;
}

/** Filter list to match dashboard card counts. */
export function filterCustomersByMetric(customers, metric) {
  if (!metric || metric === 'posted') {
    return customers;
  }
  if (metric === 'completed') {
    return customers.filter(isInstallationComplete);
  }
  if (metric === 'completed_today') {
    return customers.filter((c) => {
      const at = getActivityTime(c);
      return isInstallationComplete(c) && at && at.isSame(moment(), 'day');
    });
  }
  if (metric === 'completed_month') {
    return customers.filter((c) => {
      const at = getActivityTime(c);
      return isInstallationComplete(c) && at && at.isSame(moment(), 'month');
    });
  }
  return customers;
}

/** Sync list page filter controls with dashboard metric. */
export function getMetricFilterState(metric) {
  const base = { status: 'all', start: '', end: '' };
  if (metric === 'completed') {
    return { ...base, status: 'installation complete' };
  }
  if (metric === 'completed_today') {
    const today = moment().format('YYYY-MM-DD');
    return { status: 'installation complete', start: today, end: today };
  }
  if (metric === 'completed_month') {
    return {
      status: 'installation complete',
      start: moment().startOf('month').format('YYYY-MM-DD'),
      end: moment().endOf('month').format('YYYY-MM-DD'),
    };
  }
  return base;
}

/** Manual filters (status + activity date range). */
export function filterCustomers(customers, filters) {
  return customers.filter((c) => {
    const status = (c.ticketStatus || c.status || '').toString().toLowerCase();
    if (filters.status !== 'all' && status !== filters.status.toLowerCase()) {
      return false;
    }
    const at = getActivityTime(c);
    if (filters.start) {
      if (!at || at.isBefore(moment(filters.start), 'day')) return false;
    }
    if (filters.end) {
      if (!at || at.isAfter(moment(filters.end), 'day')) return false;
    }
    return true;
  });
}
