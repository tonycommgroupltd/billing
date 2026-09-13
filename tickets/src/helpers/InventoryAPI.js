import { http } from '../helpers';

// Safely get environment variables with fallbacks
// In production builds, webpack replaces process.env.REACT_APP_* at build time
// But we need a fallback for cases where process is not defined
const getEnvVar = (key, defaultValue = '') => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key]) {
            return process.env[key];
        }
    } catch (e) {
        // process is not defined, use default
    }
    return defaultValue;
};

// Use localStorage flag - default to false (use API)
const USE_LOCALSTORAGE = getEnvVar('REACT_APP_USE_LOCALSTORAGE', 'false') === 'true';

const LS_KEY = 'inventory_store_v1';

const getStore = () => {
    const seed = { 
        items: [], 
        requests: [], 
        disbursements: [],
        lastItemId: 1000, 
        lastRequestId: 2000,
        lastDisbursementId: 3000
    };
    try {
        const stored = localStorage.getItem(LS_KEY);
        return stored ? JSON.parse(stored) : seed;
    } catch (err) {
        return seed;
    }
};

const saveStore = (store) => {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(store));
    } catch (err) {
        console.error('Failed to save inventory store', err);
    }
};

const InventoryAPI = {
    // ============ Items Management ============
    
    // Get all inventory items
    getItems: async (params = {}) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            let items = [...store.items];
            
            // Filter by category
            if (params.category) {
                items = items.filter(item => item.category === params.category);
            }
            
            // Filter by status
            if (params.status) {
                items = items.filter(item => item.status === params.status);
            }
            
            // Search by name
            if (params.search) {
                const search = params.search.toLowerCase();
                items = items.filter(item => 
                    item.name.toLowerCase().includes(search) ||
                    (item.description || '').toLowerCase().includes(search)
                );
            }
            
            return { data: items };
        }
        
        const queryString = new URLSearchParams(params).toString();
        const response = await http.get(`/inventory/items${queryString ? '?' + queryString : ''}`);
        
        console.log("Raw API response:", response);
        console.log("Response.data:", response?.data);
        
        // Handle API response format: {success: true, data: [...]}
        // Axios wraps it, so response.data = {success: true, data: [...]}
        // We need to extract response.data.data
        if (response?.data?.success && Array.isArray(response.data.data)) {
            console.log("Extracted items from response.data.data:", response.data.data.length);
            return { data: response.data.data };
        } else if (Array.isArray(response?.data)) {
            console.log("Response.data is already an array:", response.data.length);
            return { data: response.data };
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
            console.log("Extracted items from nested response.data.data:", response.data.data.length);
            return { data: response.data.data };
        }
        
        console.warn("Unexpected response format:", response);
        return { data: [] };
    },
    
    // Get single item
    getItem: async (id) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const item = store.items.find(i => `${i.id}` === `${id}`);
            return { data: item || null };
        }
        
        return await http.get(`/inventory/items/${id}`);
    },
    
    // Add new inventory item
    addItem: async (itemData) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const newItem = {
                id: ++store.lastItemId,
                ...itemData,
                quantity_available: itemData.quantity || 0,
                quantity_total: itemData.quantity || 0,
                quantity_requested: 0,
                quantity_disbursed: 0,
                status: 'active',
                is_serialized: itemData.is_serialized || false,
                serial_number: itemData.serial_number || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            store.items.unshift(newItem);
            saveStore(store);
            return { data: newItem };
        }
        
        console.log("Sending to API:", itemData);
        const response = await http.post('/inventory/items', itemData);
        console.log("API Response:", response);
        
        // Handle API response format: {success: true, data: {...}, message: '...'}
        // Axios wraps it, so response.data = {success: true, data: {...}, message: '...'}
        // Return the data in a consistent format
        if (response?.data?.success && response.data.data) {
            return { data: response.data.data, success: true, message: response.data.message };
        }
        
        return response;
    },
    
    // Update inventory item
    updateItem: async (id, itemData) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const idx = store.items.findIndex(i => `${i.id}` === `${id}`);
            if (idx !== -1) {
                store.items[idx] = {
                    ...store.items[idx],
                    ...itemData,
                    updated_at: new Date().toISOString()
                };
                saveStore(store);
                return { data: store.items[idx] };
            }
            return { data: null };
        }
        
        return await http.put(`/inventory/items/${id}`, itemData);
    },
    
    // Delete inventory item (pass actor so the backend can log who deleted it)
    deleteItem: async (id, actorId = null, actorName = null) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            store.items = store.items.filter(i => `${i.id}` !== `${id}`);
            saveStore(store);
            return { data: { success: true } };
        }
        
        return await http.delete(`/inventory/items/${id}`, {
            data: { deleted_by_id: actorId, deleted_by_name: actorName },
        });
    },
    
    // ============ Requests Management ============
    
    // Get all inventory requests
    getRequests: async (params = {}) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            let requests = [...store.requests];
            
            // Filter by status
            if (params.status) {
                requests = requests.filter(r => r.status === params.status);
            }
            
            // Filter by requester
            if (params.requester_id) {
                requests = requests.filter(r => r.requester_id === params.requester_id);
            }
            
            return { data: requests };
        }
        
        const queryString = new URLSearchParams(params).toString();
        return await http.get(`/inventory/requests${queryString ? '?' + queryString : ''}`);
    },
    
    // Get single request
    getRequest: async (id) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const request = store.requests.find(r => `${r.id}` === `${id}`);
            return { data: request || null };
        }
        
        return await http.get(`/inventory/requests/${id}`);
    },
    
    // Create new request
    createRequest: async (requestData) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const newRequest = {
                id: ++store.lastRequestId,
                ...requestData,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            store.requests.unshift(newRequest);
            
            // Update item quantity_requested
            const item = store.items.find(i => i.id === requestData.item_id);
            if (item) {
                item.quantity_requested = (item.quantity_requested || 0) + (requestData.quantity || 0);
            }
            
            saveStore(store);
            return { data: newRequest };
        }
        
        return await http.post('/inventory/requests', requestData);
    },
    
    // Approve request and create disbursement
    approveRequest: async (id, approvalData) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const requestIdx = store.requests.findIndex(r => `${r.id}` === `${id}`);
            
            if (requestIdx !== -1) {
                const request = store.requests[requestIdx];
                
                // Update request status
                store.requests[requestIdx] = {
                    ...request,
                    status: 'approved',
                    approved_by: approvalData.approved_by,
                    approved_at: new Date().toISOString(),
                    notes: approvalData.notes || request.notes,
                    updated_at: new Date().toISOString(),
                };
                
                // Create disbursement
                const disbursement = {
                    id: ++store.lastDisbursementId,
                    request_id: request.id,
                    item_id: request.item_id,
                    item_name: request.item_name,
                    quantity: request.quantity,
                    requester_id: request.requester_id,
                    requester_name: request.requester_name,
                    disbursed_by: approvalData.approved_by,
                    disbursed_by_name: approvalData.approved_by_name || 'Administrator',
                    notes: approvalData.notes || '',
                    location: null,
                    location_updated_at: null,
                    created_at: new Date().toISOString(),
                };
                store.disbursements.unshift(disbursement);
                
                // Update item quantities
                const item = store.items.find(i => i.id === request.item_id);
                if (item) {
                    item.quantity_available = (item.quantity_available || 0) - (request.quantity || 0);
                    item.quantity_requested = Math.max(0, (item.quantity_requested || 0) - (request.quantity || 0));
                    item.quantity_disbursed = (item.quantity_disbursed || 0) + (request.quantity || 0);
                }
                
                saveStore(store);
                return { data: store.requests[requestIdx] };
            }
            return { data: null };
        }
        
        return await http.post(`/inventory/requests/${id}/approve`, approvalData);
    },
    
    // Reject request
    rejectRequest: async (id, rejectionData) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const requestIdx = store.requests.findIndex(r => `${r.id}` === `${id}`);
            
            if (requestIdx !== -1) {
                const request = store.requests[requestIdx];
                store.requests[requestIdx] = {
                    ...request,
                    status: 'rejected',
                    rejected_by: rejectionData.rejected_by,
                    rejected_at: new Date().toISOString(),
                    rejection_reason: rejectionData.rejection_reason || '',
                    updated_at: new Date().toISOString(),
                };
                
                // Update item quantity_requested
                const item = store.items.find(i => i.id === request.item_id);
                if (item) {
                    item.quantity_requested = Math.max(0, (item.quantity_requested || 0) - (request.quantity || 0));
                }
                
                saveStore(store);
                return { data: store.requests[requestIdx] };
            }
            return { data: null };
        }
        
        return await http.post(`/inventory/requests/${id}/reject`, rejectionData);
    },
    
    // ============ Disbursements Management ============
    
    // Get all disbursements
    getDisbursements: async (params = {}) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            let disbursements = [...store.disbursements];
            
            // Filter by requester
            if (params.requester_id) {
                disbursements = disbursements.filter(d => d.requester_id === params.requester_id);
            }
            
            return { data: disbursements };
        }
        
        const queryString = new URLSearchParams(params).toString();
        return await http.get(`/inventory/disbursements${queryString ? '?' + queryString : ''}`);
    },
    
    // Get single disbursement
    getDisbursement: async (id) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const disbursement = store.disbursements.find(d => `${d.id}` === `${id}`);
            return { data: disbursement || null };
        }
        
        return await http.get(`/inventory/disbursements/${id}`);
    },
    
    // Update location for disbursement
    updateDisbursementLocation: async (id, locationData) => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const idx = store.disbursements.findIndex(d => `${d.id}` === `${id}`);
            
            if (idx !== -1) {
                store.disbursements[idx] = {
                    ...store.disbursements[idx],
                    location: locationData.location,
                    location_updated_at: new Date().toISOString(),
                };
                saveStore(store);
                return { data: store.disbursements[idx] };
            }
            return { data: null };
        }
        
        return await http.patch(`/inventory/disbursements/${id}/location`, locationData);
    },
    
    // ============ Statistics ============
    
    getStats: async () => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            
            const stats = {
                total_items: store.items.length,
                active_items: store.items.filter(i => i.status === 'active').length,
                low_stock_items: store.items.filter(i => i.quantity_available < (i.minimum_quantity || 5)).length,
                pending_requests: store.requests.filter(r => r.status === 'pending').length,
                approved_requests: store.requests.filter(r => r.status === 'approved').length,
                rejected_requests: store.requests.filter(r => r.status === 'rejected').length,
                total_disbursements: store.disbursements.length,
                total_quantity_disbursed: store.disbursements.reduce((sum, d) => sum + (d.quantity || 0), 0),
            };
            
            return { data: stats };
        }
        
        return await http.get('/inventory/stats');
    },
    
    // Search routers by last-4 chars of serial number
    searchBySerial: async (q) => {
        if (!q || q.length < 2) return { data: [] };
        const response = await http.get(`/inventory/search-serial?q=${encodeURIComponent(q)}`);
        if (response?.data?.success && Array.isArray(response.data.data)) {
            return { data: response.data.data };
        }
        return { data: [] };
    },

    // Link a router to a ticket
    linkRouterToTicket: async (payload) => {
        const response = await http.post('/inventory/link-ticket', payload);
        if (response?.data?.success) {
            return {
                data: response.data.data,
                success: true,
                patchcord: response.data.patchcord || null,
                patchcord_warning: response.data.patchcord_warning || null,
            };
        }
        return response;
    },

    // Get technicians & engineers for assignment dropdown
    // Reuses the same endpoint as ticket create "Assign To"
    getUsers: async () => {
        try {
            const response = await http.get('/tickets.php/assignment-options');
            const data = response?.data?.data;
            if (Array.isArray(data)) return { data };
        } catch (e) { /* fall through */ }
        return { data: [] };
    },

    // List disbursements
    listDisbursements: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const response = await http.get(`/inventory/disbursements${queryString ? '?' + queryString : ''}`);
        if (response?.data?.success && Array.isArray(response.data.data)) {
            return { data: response.data.data };
        }
        return { data: [] };
    },

    /** Server-side pending balances (same rules as ticket usage validation). */
    listPendingBalances: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const response = await http.get(`/inventory/pending-balances${queryString ? '?' + queryString : ''}`);
        if (response?.data?.success && Array.isArray(response.data.data)) {
            return { data: response.data.data };
        }
        return { data: [] };
    },

    // Create a disbursement (assign router or item to a user)
    createDisbursement: async (payload) => {
        const response = await http.post('/inventory/disbursements', payload);
        if (response?.data?.success) {
            return {
                data: response.data.data,
                success: true,
                patchcord: response.data.patchcord || null,
            };
        }
        return response;
    },

    // Delete / undo a disbursement (pass actor so the backend can log who removed it)
    deleteDisbursement: async (id, actorId = null, actorName = null) => {
        return await http.delete(`/inventory/disbursements/${id}`, {
            data: { actor_id: actorId, actor_name: actorName },
        });
    },

    // Return part of an item disbursement (keeps pending balance with user)
    returnDisbursement: async (id, quantity, actorId = null, actorName = null, notes = '', disposition = 'return') => {
        return await http.post(`/inventory/disbursements/${id}/return`, {
            quantity,
            actor_id: actorId,
            actor_name: actorName,
            notes,
            disposition,
        });
    },

    listDiscardedCable: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const response = await http.get(`/inventory/discarded${queryString ? '?' + queryString : ''}`);
        if (response?.data?.success) {
            return { data: response.data.data };
        }
        return { data: Array.isArray(response?.data?.data) ? response.data.data : null };
    },

    // Finalize an assignment session — sends one summary SMS + in-app notification
    finalizeAssignment: async (payload) => {
        const response = await http.post('/inventory/finalize-assignment', payload);
        if (response?.data?.success) {
            return {
                success:    true,
                sms_status: response.data.sms_status || 'unknown',
                sms_note:   response.data.sms_note   || '',
            };
        }
        return response;
    },

    // Get full activity logs: adds, deletes + all disbursements merged
    getItemLogs: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const response = await http.get(`/inventory/activity-logs${queryString ? '?' + queryString : ''}`);
        if (response?.data?.success && Array.isArray(response.data.data)) {
            return { data: response.data.data };
        }
        return { data: [] };
    },

    /** Numbered drop cable rolls — ticket usage per roll (e.g. T400). */
    getCableRollUsage: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const response = await http.get(`/inventory/cable-usage${queryString ? '?' + queryString : ''}`);
        if (response?.data?.success && Array.isArray(response.data.data)) {
            return { data: response.data.data };
        }
        return { data: [] };
    },

    // Get all inventory usage logged against a specific ticket
    getTicketUsage: async (ticketId) => {
        const response = await http.get(`/inventory/disbursements?ticket_id=${ticketId}`);
        if (response?.data?.success && Array.isArray(response.data.data)) {
            return { data: response.data.data };
        }
        return { data: [] };
    },

    // Get categories
    getCategories: async () => {
        if (USE_LOCALSTORAGE) {
            const store = getStore();
            const categories = [...new Set(store.items.map(i => i.category).filter(Boolean))];
            return { data: categories };
        }
        
        return await http.get('/inventory/categories');
    },
};

export default InventoryAPI;
