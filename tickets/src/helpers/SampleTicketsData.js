// Sample tickets seed data for testing
export const sampleTickets = [
  {
    id: 1001,
    number: '#1001',
    subject: 'Installation - 245 Kampala Road - 0740000000',
    customer: {
      name: 'John Mwangi',
      email: 'john.mwangi@email.com',
      phone: '0740000000',
      address: '245 Kampala Road, Nairobi',
      initial: 'JM'
    },
    address: '245 Kampala Road, Nairobi',
    priority: 'high',
    status: 'new',
    group: 'Any',
    type: 'Installation',
    assignedTo: 'Mwangi (Technician)',
    createdBy: 'Main Admin',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    watching: 'No'
  },
  {
    id: 1002,
    number: '#1002',
    subject: 'Installation - 512 Mombasa Road - 0750000000',
    customer: {
      name: 'Alice Kariuki',
      email: 'alice.kariuki@email.com',
      phone: '0750000000',
      address: '512 Mombasa Road, Nairobi',
      initial: 'AK'
    },
    address: '512 Mombasa Road, Nairobi',
    priority: 'medium',
    status: 'open',
    group: 'Any',
    type: 'Installation',
    assignedTo: 'Mwangi (Technician)',
    createdBy: 'Main Admin',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    watching: 'No'
  },
  {
    id: 1003,
    number: '#1003',
    subject: 'No Internet - Customer Service Issue',
    customer: {
      name: 'David Ochieng',
      email: 'david.ochieng@email.com',
      phone: '0721234567',
      address: 'Westlands, Nairobi',
      initial: 'DO'
    },
    address: 'Westlands, Nairobi',
    priority: 'high',
    status: 'new',
    group: 'Any',
    type: 'No LOS no internet',
    assignedTo: 'Mwangi (Technician)',
    createdBy: 'Main Admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    watching: 'No'
  },
  {
    id: 1004,
    number: '#1004',
    subject: 'Slow Internet Speed',
    customer: {
      name: 'Jane Smith',
      email: 'jane.smith@email.com',
      phone: '0722334455',
      address: 'CBD, Nairobi',
      initial: 'JS'
    },
    address: 'CBD, Nairobi',
    priority: 'medium',
    status: 'solved',
    group: 'Any',
    type: 'Slow speeds',
    assignedTo: 'Mwangi (Technician)',
    createdBy: 'Main Admin',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    watching: 'No'
  },
  {
    id: 1005,
    number: '#1005',
    subject: 'Installation - 789 Ngong Road - 0723456789',
    customer: {
      name: 'Robert Kipchoge',
      email: 'robert.kipchoge@email.com',
      phone: '0723456789',
      address: '789 Ngong Road, Nairobi',
      initial: 'RK'
    },
    address: '789 Ngong Road, Nairobi',
    priority: 'medium',
    status: 'new',
    group: 'Any',
    type: 'Installation',
    assignedTo: 'John Kamau (Technician)',
    createdBy: 'Main Admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    watching: 'No'
  }
];

/**
 * Seed sample tickets to localStorage if empty or update existing sample tickets with corrected data
 */
export const initializeSampleTickets = () => {
  const LS_KEY = 'tickets_store_v1';
  try {
    const raw = localStorage.getItem(LS_KEY);
    const store = raw ? JSON.parse(raw) : { tickets: [], lastId: 1000 };
    
    // Update existing sample tickets with corrected status values
    const correctedStatuses = {
      1002: 'open', // was 'work in progress'
      1004: 'solved' // was 'resolved'
    };
    
    store.tickets = store.tickets.map(ticket => {
      if (correctedStatuses[ticket.id]) {
        return { ...ticket, status: correctedStatuses[ticket.id] };
      }
      return ticket;
    });
    
    // Only seed if no tickets exist
    if (!store.tickets || store.tickets.length === 0) {
      store.tickets = sampleTickets;
      store.lastId = 1005;
    }
    
    localStorage.setItem(LS_KEY, JSON.stringify(store));
    console.log('Sample tickets initialized/updated successfully');
  } catch (error) {
    console.error('Error initializing sample tickets:', error);
  }
};
