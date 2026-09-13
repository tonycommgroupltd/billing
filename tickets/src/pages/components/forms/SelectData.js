export const defaultOptions = [
  { value: "chocolate", label: "Chocolate" },
  { value: "strawberry", label: "Strawberry" },
  { value: "vanilla", label: "Vanilla" },
];

export const colourData = [
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "white", label: "White" },
];

export const groupedData = [
  {
    label: "Flavours",
    options: [
      { value: "chocolate", label: "Chocolate" },
      { value: "strawberry", label: "Strawberry" },
      { value: "vanilla", label: "Vanilla" },
    ],
  },
  {
    label: "Colors",
    options: [
      { value: "red", label: "Red" },
      { value: "blue", label: "Blue" },
      { value: "green", label: "Green" },
    ],
  },
  { label: "UnGrouped", value: "value_3" },
];

export const nasTypeOptions = [
  { value: "MikroTik", label: "MikroTik" },
  { value: "Cisco", label: "Cisco" },
  { value: "Ericsson", label: "Ericsson" },
  { value: "Linux PPPD", label: "Linux PPPD" },
  { value: "Ubiquiti", label: "Ubiquiti" },
  { value: "D-Link", label: "D-Link" },
  { value: "Juniper", label: "Juniper" },
  { value: "netElastic", label: "netElastic" },
];

export const authorizationOptions = [
  { value: "", label: "None" },
  { value: "Firewall IP-MAC filter", label: "Firewall IP-MAC filter" },
  { value: "DHCP (Leases)", label: "DHCP (Leases)" },
  { value: "PPP/DHCP (Radius)", label: "PPP/DHCP (Radius)" },
  { value: "PPP (Secrets)", label: "PPP (Secrets)" },
  { value: "Hotspot (Users)", label: "Hotspot (Users)" },
  { value: "Hotspot (Radius)", label: "Hotspot (Radius)" },
];

export const accountingOptions = [
  { value: "", label: "None" },
  { value: "Radius accounting", label: "Radius accounting" },
  { value: "NetFlow accounting", label: "NetFlow accounting" },
];

export const billingTypeOptions = [
  { value: 1, label: "Recurring" },
  { value: 2, label: "Prepaid (Custom)" },
];

export const billingPeriodOptions = [
  { value: 1, label: "Weekly" },
  { value: 2, label: "Bi-Weekly" },
  { value: 3, label: "Monthly" },
];

export const categoryOptions = [
  { value: 1, label: "Individual" },
  { value: 2, label: "Business" },
  { value: 3, label: "Reseller" },
];

export const rolesSchemeOptions = [
  { value: '', label: "None" },
  { value: 'administrator', label: "Administrator" },
  { value: 'customer-creator', label: "Customer creator" },
  { value: 'engineer', label: "Engineer" },
  { value: 'financial-manager', label: "Financial manager" },
  { value: 'manager', label: "Manager" },
  { value: 'reseller', label: "Reseller" },
  { value: 'super-administrator', label: "Super administrator" },
  { value: 'technician', label: "Technician" },
];

export const serviceOptions = [
  { value: 0, label: "Pending" },
  { value: 1, label: "Disabled" },
  { value: 2, label: "Active" },
];

export const serviceOptionsCust = [
  { value: 1, label: "Disabled" },
  { value: 2, label: "Active" },
];

export const paymentOptions = [
  { value: "mpesa", label: "Mpesa" }
]

export const invoiceStatusOptions = [
  { value: 1, label: "Unpaid" },
  { value: 2, label: "Paid" },
];

export const creditOptions = [
  { value: 'add', label: "Addition" },
  { value: 'reduce', label: "Deduction" },
];

export const messageOptions = [
  { value: 'sms', label: "SMS" },
  { value: 'whatsapp', label: "WhatsApp" },
];
