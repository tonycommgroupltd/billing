// Tickets Chart Data
export const ticketsResolvedData = {
  labels: [
    "Dec 16",
    "Dec 17", 
    "Dec 18",
    "Dec 19",
    "Dec 20",
    "Dec 21",
    "Dec 22",
    "Dec 23"
  ],
  dataUnit: "Tickets",
  datasets: [
    {
      label: "Created",
      backgroundColor: "#FFC914",
      borderColor: "#FFC914", 
      data: [12, 8, 15, 10, 7, 9, 14, 11],
      barPercentage: 0.7,
      categoryPercentage: 0.7,
    },
    {
      label: "Reopened", 
      backgroundColor: "#367BF5",
      borderColor: "#367BF5",
      data: [2, 1, 3, 0, 1, 2, 1, 0],
      barPercentage: 0.7,
      categoryPercentage: 0.7,
    },
    {
      label: "Resolved",
      backgroundColor: "#29CC97",
      borderColor: "#29CC97", 
      data: [10, 12, 8, 14, 11, 6, 13, 16],
      barPercentage: 0.7,
      categoryPercentage: 0.7,
    },
  ],
};

export const generateTicketsDataForDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const labels = [];
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  // Generate labels for date range
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    labels.push(`${monthNames[date.getMonth()]} ${date.getDate()}`);
  }
  
  // Generate sample data for each day
  const createdData = [];
  const reopenedData = [];
  const resolvedData = [];
  
  for (let i = 0; i < days; i++) {
    createdData.push(Math.floor(Math.random() * 20) + 5);
    reopenedData.push(Math.floor(Math.random() * 5));
    resolvedData.push(Math.floor(Math.random() * 25) + 5);
  }
  
  return {
    labels,
    dataUnit: "Tickets",
    datasets: [
      {
        label: "Created",
        backgroundColor: "#FFC914",
        borderColor: "#FFC914", 
        data: createdData,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      },
      {
        label: "Reopened", 
        backgroundColor: "#367BF5",
        borderColor: "#367BF5",
        data: reopenedData,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      },
      {
        label: "Resolved",
        backgroundColor: "#29CC97",
        borderColor: "#29CC97", 
        data: resolvedData,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      },
    ],
  };
};

export const agentPerformanceData = [
  {
    name: "John Smith",
    assigned: 45,
    answers: 42,
    reassign: 3,
    resolves: 38,
    reopens: 2,
    percentage: 85
  },
  {
    name: "Sarah Johnson", 
    assigned: 38,
    answers: 35,
    reassign: 2,
    resolves: 32,
    reopens: 1,
    percentage: 89
  },
  {
    name: "Mike Davis",
    assigned: 52,
    answers: 48,
    reassign: 4,
    resolves: 44,
    reopens: 3,
    percentage: 82
  },
  {
    name: "Emily Wilson",
    assigned: 31,
    answers: 30,
    reassign: 1,
    resolves: 28,
    reopens: 1,
    percentage: 93
  },
  {
    name: "David Brown",
    assigned: 29,
    answers: 27,
    reassign: 2,
    resolves: 25,
    reopens: 1,
    percentage: 86
  },
  {
    name: "Lisa Garcia",
    assigned: 41,
    answers: 39,
    reassign: 3,
    resolves: 36,
    reopens: 2,
    percentage: 88
  },
  {
    name: "Robert Miller",
    assigned: 35,
    answers: 32,
    reassign: 3,
    resolves: 29,
    reopens: 2,
    percentage: 83
  },
  {
    name: "Jessica Lee",
    assigned: 48,
    answers: 46,
    reassign: 2,
    resolves: 43,
    reopens: 1,
    percentage: 91
  },
  {
    name: "Christopher Taylor",
    assigned: 33,
    answers: 31,
    reassign: 2,
    resolves: 28,
    reopens: 1,
    percentage: 85
  },
  {
    name: "Amanda Anderson",
    assigned: 37,
    answers: 35,
    reassign: 2,
    resolves: 33,
    reopens: 1,
    percentage: 89
  }
];

export const generateRecentActivities = () => {
  const activities = [
    {
      id: 1,
      type: 'status_change',
      agent: { name: 'Ronald Ndungu', initials: 'RN', color: '#357bf2' },
      ticket: { id: '#4878', title: '0789098993 - Network connectivity issue' },
      action: 'Changed status',
      details: 'Changed status to Resolved',
      timestamp: new Date(Date.now() - 27 * 60 * 1000),
      priority: 'high'
    },
    {
      id: 2,
      type: 'ticket_created',
      agent: { name: 'Sarah Johnson', initials: 'SJ', color: '#29cc97' },
      ticket: { id: '#4895', title: 'Installation - Caldera Office Complex' },
      action: 'Created ticket',
      details: 'New installation request for fiber connection',
      timestamp: new Date(Date.now() - 42 * 60 * 1000),
      priority: 'medium'
    },
    {
      id: 3,
      type: 'ticket_assigned',
      agent: { name: 'Mike Davis', initials: 'MD', color: '#ffaf14' },
      ticket: { id: '#4894', title: 'Relocation - Eastmore Business Park' },
      action: 'Assigned ticket',
      details: 'Ticket assigned to technical team',
      timestamp: new Date(Date.now() - 65 * 60 * 1000),
      priority: 'medium'
    },
    {
      id: 4,
      type: 'customer_reply',
      agent: { name: 'Customer', initials: 'CU', color: '#6b73ff' },
      ticket: { id: '#4892', title: '0712345678 - Slow internet speeds' },
      action: 'Customer replied',
      details: 'Provided additional speed test results',
      timestamp: new Date(Date.now() - 90 * 60 * 1000),
      priority: 'high'
    },
    {
      id: 5,
      type: 'status_change',
      agent: { name: 'Emily Wilson', initials: 'EW', color: '#e74c3c' },
      ticket: { id: '#4891', title: 'Equipment maintenance - Router replacement' },
      action: 'Reopened ticket',
      details: 'Reopened due to recurring issues',
      timestamp: new Date(Date.now() - 120 * 60 * 1000),
      priority: 'urgent'
    },
    {
      id: 6,
      type: 'comment_added',
      agent: { name: 'David Brown', initials: 'DB', color: '#9c27b0' },
      ticket: { id: '#4890', title: 'Billing inquiry - Invoice discrepancy' },
      action: 'Added comment',
      details: 'Requested account verification documents',
      timestamp: new Date(Date.now() - 150 * 60 * 1000),
      priority: 'low'
    },
    {
      id: 7,
      type: 'escalation',
      agent: { name: 'System', initials: 'SY', color: '#ff5722' },
      ticket: { id: '#4889', title: 'VIP Customer - Service outage' },
      action: 'Auto-escalated',
      details: 'Escalated to senior technician due to VIP status',
      timestamp: new Date(Date.now() - 180 * 60 * 1000),
      priority: 'urgent'
    }
  ];
  
  return activities.sort((a, b) => b.timestamp - a.timestamp);
};

export const getActivityIcon = (type) => {
  const icons = {
    'status_change': '🔄',
    'ticket_created': '📝',
    'ticket_assigned': '👤',
    'customer_reply': '💬',
    'comment_added': '💭',
    'escalation': '⚡'
  };
  return icons[type] || '📋';
};

export const getPriorityColor = (priority) => {
  const colors = {
    'urgent': '#e74c3c',
    'high': '#f39c12',
    'medium': '#3498db',
    'low': '#95a5a6'
  };
  return colors[priority] || '#95a5a6';
};

export const getTimeAgo = (timestamp) => {
  const now = new Date();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};