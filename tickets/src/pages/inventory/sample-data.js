// Sample Inventory Data for Testing
// Copy this into browser console to seed the inventory system

const sampleInventory = {
  items: [
    {
      id: 1001,
      name: "GPON Fiber Router - Huawei HG8245H",
      description: "Gigabit passive optical network terminal with 4 GE ports",
      category: "GPON Router",
      quantity_available: 45,
      quantity_total: 50,
      quantity_requested: 3,
      quantity_disbursed: 2,
      unit: "pcs",
      minimum_quantity: 10,
      unit_price: 45.50,
      status: "active",
      created_at: "2025-12-01T08:00:00Z",
      updated_at: "2025-12-28T10:30:00Z"
    },
    {
      id: 1002,
      name: "XPON Fiber Router - ZTE F660",
      description: "Universal PON optical network unit",
      category: "XPON Router",
      quantity_available: 28,
      quantity_total: 30,
      quantity_requested: 0,
      quantity_disbursed: 2,
      unit: "pcs",
      minimum_quantity: 8,
      unit_price: 52.00,
      status: "active",
      created_at: "2025-12-01T08:00:00Z",
      updated_at: "2025-12-28T10:30:00Z"
    },
    {
      id: 1003,
      name: "Fiber Optic Cable - Single Mode",
      description: "OS2 9/125μm single mode fiber cable",
      category: "Fiber Cable",
      quantity_available: 500,
      quantity_total: 1000,
      quantity_requested: 200,
      quantity_disbursed: 300,
      unit: "meters",
      minimum_quantity: 100,
      unit_price: 0.85,
      status: "active",
      created_at: "2025-12-01T08:00:00Z",
      updated_at: "2025-12-28T10:30:00Z"
    },
    {
      id: 1004,
      name: "SC/UPC Fiber Connector",
      description: "Single mode SC/UPC connectors",
      category: "Connectors",
      quantity_available: 3,
      quantity_total: 100,
      quantity_requested: 10,
      quantity_disbursed: 87,
      unit: "pcs",
      minimum_quantity: 20,
      unit_price: 1.20,
      status: "active",
      created_at: "2025-12-01T08:00:00Z",
      updated_at: "2025-12-28T10:30:00Z"
    },
    {
      id: 1005,
      name: "Fiber Optic Splice Closure",
      description: "24 core fiber splice closure box",
      category: "Installation Hardware",
      quantity_available: 15,
      quantity_total: 20,
      quantity_requested: 2,
      quantity_disbursed: 3,
      unit: "pcs",
      minimum_quantity: 5,
      unit_price: 28.00,
      status: "active",
      created_at: "2025-12-01T08:00:00Z",
      updated_at: "2025-12-28T10:30:00Z"
    },
    {
      id: 1006,
      name: "Cat6 Ethernet Cable",
      description: "23AWG UTP Cat6 cable - 305m box",
      category: "Network Cable",
      quantity_available: 8,
      quantity_total: 12,
      quantity_requested: 1,
      quantity_disbursed: 3,
      unit: "boxes",
      minimum_quantity: 3,
      unit_price: 65.00,
      status: "active",
      created_at: "2025-12-01T08:00:00Z",
      updated_at: "2025-12-28T10:30:00Z"
    }
  ],
  requests: [
    {
      id: 2001,
      item_id: 1001,
      item_name: "GPON Fiber Router - Huawei HG8245H",
      item_category: "GPON Router",
      quantity: 2,
      purpose: "Customer installation - New subscriber",
      notes: "Urgent installation for premium customer",
      requester_id: 5,
      requester_name: "John Tech",
      status: "pending",
      created_at: "2025-12-28T09:15:00Z",
      updated_at: "2025-12-28T09:15:00Z"
    },
    {
      id: 2002,
      item_id: 1003,
      item_name: "Fiber Optic Cable - Single Mode",
      item_category: "Fiber Cable",
      quantity: 150,
      purpose: "Customer installation - 120m from junction box",
      notes: "Additional 30m for contingency",
      requester_id: 6,
      requester_name: "Sarah Engineer",
      status: "pending",
      created_at: "2025-12-28T10:00:00Z",
      updated_at: "2025-12-28T10:00:00Z"
    },
    {
      id: 2003,
      item_id: 1002,
      item_name: "XPON Fiber Router - ZTE F660",
      item_category: "XPON Router",
      quantity: 1,
      purpose: "Router replacement - Faulty unit",
      notes: "Customer ID: C-1245, RMA required for old unit",
      requester_id: 5,
      requester_name: "John Tech",
      status: "approved",
      approved_by: 1,
      approved_at: "2025-12-27T14:30:00Z",
      created_at: "2025-12-27T11:20:00Z",
      updated_at: "2025-12-27T14:30:00Z"
    },
    {
      id: 2004,
      item_id: 1004,
      item_name: "SC/UPC Fiber Connector",
      item_category: "Connectors",
      quantity: 20,
      purpose: "Workshop inventory restocking",
      notes: "Running low on connectors",
      requester_id: 7,
      requester_name: "Mike Technician",
      status: "rejected",
      rejected_by: 1,
      rejected_at: "2025-12-26T16:00:00Z",
      rejection_reason: "Too many units requested. Please request smaller quantity.",
      created_at: "2025-12-26T13:45:00Z",
      updated_at: "2025-12-26T16:00:00Z"
    }
  ],
  disbursements: [
    {
      id: 3001,
      request_id: 2003,
      item_id: 1002,
      item_name: "XPON Fiber Router - ZTE F660",
      quantity: 1,
      requester_id: 5,
      requester_name: "John Tech",
      disbursed_by: 1,
      disbursed_by_name: "Admin User",
      notes: "Approved for faulty unit replacement",
      location: "123 Main Street, Apt 4B - Customer: Jane Smith",
      location_updated_at: "2025-12-27T16:45:00Z",
      created_at: "2025-12-27T14:30:00Z"
    },
    {
      id: 3002,
      request_id: 1999,
      item_id: 1001,
      item_name: "GPON Fiber Router - Huawei HG8245H",
      quantity: 2,
      requester_id: 6,
      requester_name: "Sarah Engineer",
      disbursed_by: 1,
      disbursed_by_name: "Admin User",
      notes: "New installations approved",
      location: null,
      location_updated_at: null,
      created_at: "2025-12-26T10:00:00Z"
    },
    {
      id: 3003,
      request_id: 1998,
      item_id: 1003,
      item_name: "Fiber Optic Cable - Single Mode",
      quantity: 200,
      requester_id: 5,
      requester_name: "John Tech",
      disbursed_by: 2,
      disbursed_by_name: "Manager User",
      notes: "Major installation project",
      location: "Downtown Business District - 5 customer installations completed",
      location_updated_at: "2025-12-25T18:00:00Z",
      created_at: "2025-12-25T08:00:00Z"
    }
  ],
  lastItemId: 1006,
  lastRequestId: 2004,
  lastDisbursementId: 3003
};

// To use this sample data:
// 1. Open browser console (F12)
// 2. Copy and paste this entire file
// 3. Run: localStorage.setItem('inventory_store_v1', JSON.stringify(sampleInventory));
// 4. Refresh the page

console.log('Sample inventory data loaded. Run the following command to save:');
console.log("localStorage.setItem('inventory_store_v1', JSON.stringify(sampleInventory));");
