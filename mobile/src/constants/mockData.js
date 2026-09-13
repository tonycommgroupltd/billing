// Mock data for UI development — will be replaced with real API calls
// All data shapes match what the real APIs will return

export const MOCK_CUSTOMER = {
  id: 3878,
  name: 'George Kinuthia',
  phone_number: '0726150925',
  address: 'Wambura Estate',
  city: 'Nakuru',
  created_at: '2024-05-24',
};

export const MOCK_SERVICE = {
  id: 1001,
  customer_id: 3878,
  mikrotik_name: 'georgekinuthia',   // PPPoE username — matches SmartOLT ONU name
  mikrotik_password: 'pass1234',
  plan_id: 3,
  plan_title: '10Mbps Unlimited',
  price: 2500.00,
  status: '{"value":1,"label":"Active"}',
  start_date: '2025-11-01',
  end_date: '2026-12-01',
  bill_to: '2026-04-01',
  router_name: 'HOMELINK-Core-R1',
};

export const MOCK_INVOICES = [
  {
    id: 5001,
    services_id: 1001,
    invoice_date: '2026-03-01',
    due_date: '2026-03-10',
    total: 2500.00,
    status: '{"value":1,"label":"Unpaid"}',
    details: [
      { name: 'Internet - 10Mbps Unlimited', price_per_unit: 2500, quantity: 1, discount: 0 },
    ],
  },
  {
    id: 5000,
    invoice_date: '2026-02-01',
    due_date: '2026-02-10',
    total: 2500.00,
    status: '{"value":2,"label":"Paid"}',
    details: [
      { name: 'Internet - 10Mbps Unlimited', price_per_unit: 2500, quantity: 1, discount: 0 },
    ],
  },
  {
    id: 4999,
    invoice_date: '2026-01-01',
    due_date: '2026-01-10',
    total: 2500.00,
    status: '{"value":2,"label":"Paid"}',
    details: [
      { name: 'Internet - 10Mbps Unlimited', price_per_unit: 2500, quantity: 1, discount: 0 },
    ],
  },
  {
    id: 4998,
    invoice_date: '2025-12-01',
    due_date: '2025-12-10',
    total: 2500.00,
    status: '{"value":2,"label":"Paid"}',
    details: [
      { name: 'Internet - 10Mbps Unlimited', price_per_unit: 2500, quantity: 1, discount: 0 },
    ],
  },
  {
    id: 4997,
    invoice_date: '2025-11-01',
    due_date: '2025-11-10',
    total: 2000.00,
    status: '{"value":2,"label":"Paid"}',
    details: [
      { name: 'Internet - 5Mbps Starter', price_per_unit: 2000, quantity: 1, discount: 0 },
    ],
  },
];

export const MOCK_PAYMENTS = [
  { id: 6001, invoice_id: 5000, trans_id: 'SHK3R5X7YN', payment_type: 'Mpesa', date: '2026-02-08', sum: 2500.00 },
  { id: 6000, invoice_id: 4999, trans_id: 'SHJ2Q4W6XM', payment_type: 'Mpesa', date: '2026-01-05', sum: 2500.00 },
  { id: 5999, invoice_id: 4998, trans_id: 'SGI1P3V5WL', payment_type: 'Mpesa', date: '2025-12-09', sum: 2500.00 },
  { id: 5998, invoice_id: 4997, trans_id: 'SFH0O2U4VK', payment_type: 'Manual', date: '2025-11-07', sum: 2000.00 },
];

export const MOCK_ONU_STATUS = {
  onu_external_id: 'TC-0042',
  name: 'georgekinuthia',
  status: 'online',
  sn: 'HWTC1234ABCD',
  onu_type_name: 'HG8546M',
  pon_type: 'gpon',
  board: 0,
  port: 3,
  zone_name: 'Wambura',
  signal: 'Very good',
  signal_1490: '-18.45',    // RX power
  signal_1310: '-2.15',     // TX power
  wan_mode: 'PPPoE',
  connected_devices: [
    { mac: 'AA:BB:CC:DD:EE:01', port: 'ETH 1', vlan: '100' },
    { mac: 'AA:BB:CC:DD:EE:02', port: 'WLAN 1', vlan: '100' },
    { mac: 'AA:BB:CC:DD:EE:03', port: 'WLAN 1', vlan: '100' },
  ],
  lan_ports: [
    { port: 'ETH 1', speed: '1000M', duplex: 'Full', link: 'Up' },
    { port: 'ETH 2', speed: '', duplex: '', link: 'Down' },
    { port: 'ETH 3', speed: '', duplex: '', link: 'Down' },
    { port: 'ETH 4', speed: '', duplex: '', link: 'Down' },
  ],
  wifi: {
    ssid: 'HOMELINK-George',
    password: 'wifi12345',
    status: 'Enabled',
  },
};

export const MOCK_PLANS = [
  { id: 1, title: '5Mbps Starter', price: 2000 },
  { id: 2, title: '8Mbps Basic', price: 2200 },
  { id: 3, title: '10Mbps Unlimited', price: 2500 },
  { id: 4, title: '15Mbps Premium', price: 3500 },
  { id: 5, title: '20Mbps Business', price: 4500 },
];
