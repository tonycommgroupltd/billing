# Inventory Management System

A complete inventory management system for tracking hardware items, requests, and disbursements.

## Features

### 📊 Dashboard
- Real-time statistics overview
- Total items, active items, low stock alerts
- Pending requests and disbursement tracking
- Quick access to recent items and pending requests

### 📦 Inventory List
- Add, edit, and delete inventory items
- Categories: GPON Routers, XPON Routers, Fiber Cables, etc.
- Track available, requested, and disbursed quantities
- Low stock warnings
- Search and filter by category

### 📝 Request Inventory
- Technicians and engineers can request items
- Select item, quantity, purpose, and notes
- Request status tracking (Pending, Approved, Rejected)
- Admins/Managers can approve or reject requests

### ✅ Disbursed Inventory
- Track all approved and disbursed items
- View who requested and who disbursed each item
- Record location/usage details
- Both requesters and admins can update locations

## User Roles & Permissions

### Administrators & Managers
- Full access to all inventory features
- Add, edit, delete inventory items
- Approve/reject requests
- View all disbursements
- Update any location

### Engineers & Technicians
- View inventory list
- Request items
- View their disbursements
- Update locations for their disbursed items

### Customer Creators & Others
- Read-only access to inventory list

## Workflow

1. **Add Inventory** (Admin)
   - Navigate to Inventory > List
   - Click "Add Item"
   - Enter item details (name, category, quantity, etc.)
   - Item appears in inventory list

2. **Request Item** (Technician/Engineer)
   - Navigate to Inventory > Request Inventory
   - Click "Request Item"
   - Select item, quantity, purpose
   - Submit request

3. **Approve Request** (Admin/Manager)
   - Navigate to Inventory > Request Inventory
   - View pending requests
   - Click approve (✓) to disburse or reject (✗)
   - Item automatically added to Disbursed Inventory

4. **Update Location** (Requester/Admin)
   - Navigate to Inventory > Disbursed Inventory
   - Click location pin icon
   - Enter installation/usage location details
   - Save location

## Data Storage

The system uses localStorage by default (controlled by `REACT_APP_USE_LOCALSTORAGE` env variable).

### LocalStorage Structure
```javascript
{
  items: [],           // Inventory items
  requests: [],        // Requests
  disbursements: [],   // Disbursed items
  lastItemId: 1000,
  lastRequestId: 2000,
  lastDisbursementId: 3000
}
```

## API Endpoints (Backend Integration)

When `REACT_APP_USE_LOCALSTORAGE=false`, the system uses these endpoints:

### Items
- `GET /api/inventory/items` - Get all items
- `GET /api/inventory/items/:id` - Get single item
- `POST /api/inventory/items` - Add new item
- `PUT /api/inventory/items/:id` - Update item
- `DELETE /api/inventory/items/:id` - Delete item

### Requests
- `GET /api/inventory/requests` - Get all requests
- `GET /api/inventory/requests/:id` - Get single request
- `POST /api/inventory/requests` - Create request
- `POST /api/inventory/requests/:id/approve` - Approve request
- `POST /api/inventory/requests/:id/reject` - Reject request

### Disbursements
- `GET /api/inventory/disbursements` - Get all disbursements
- `GET /api/inventory/disbursements/:id` - Get single disbursement
- `PATCH /api/inventory/disbursements/:id/location` - Update location

### Statistics
- `GET /api/inventory/stats` - Get inventory statistics
- `GET /api/inventory/categories` - Get all categories

## Menu Navigation

**Company Section > Inventory**
- Dashboard
- List
- Request Inventory
- Disbursed Inventory

## Components Structure

```
src/pages/inventory/
├── Dashboard.js      - Overview with stats
├── List.js          - Inventory items management
├── Request.js       - Request and approval system
└── Disbursed.js     - Disbursed items tracking

src/helpers/
└── InventoryAPI.js  - API wrapper with localStorage support
```

## Example Item Categories

- GPON Fiber Router
- XPON Fiber Router
- Fiber Optic Cable (meters)
- RJ45 Connectors
- Patch Cables
- Network Switches
- Access Points
- Mounting Hardware
- Tools

## Notes

- Minimum quantity triggers low stock warnings
- All quantities are tracked separately: available, requested, disbursed
- Approval automatically creates disbursement record
- Rejection returns quantity to available pool
- Location updates maintain history with timestamps
