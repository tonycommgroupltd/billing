const menu = [
  {
    icon: "dashboard",
    text: "Dashboard",
    link: "/",
  },
  {
    icon: "chat-circle-fill",
    text: "AI Buddy",
    link: "/admin/ai-diagnostics",
  },
  {
    heading: "CRM",
  },
  {
    icon: "users",
    text: "Customers",
    active: false,
    subMenu: [
      {
        text: "Add",
        link: "/admin/customers/add",
      },
      {
        text: "Online",
        link: "/admin/customers/online",
      },
      {
        text: "List",
        link: "/admin/customers/list",
      },
      {
        text: "Unconfigured",
        link: "/admin/customers/unconfigured",
      },
      {
        text: "SmartOLT",
        link: "/admin/customers/smartolt",
      },
    ],
  },
  {
    icon: "user-list",
    text: "Leads",
    active: false,
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/leads/dashboard",
      },
      {
        text: "Add Lead",
        link: "/admin/leads/add",
      },
      {
        text: "All Leads",
        link: "/admin/leads/list",
      },
    ],
  },
  {
    icon: "ticket",
    text: "Tickets",
    active: false,
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/tickets/dashboard",
      },
      {
        text: "List",
        link: "/admin/tickets/list",
      },
      {
        text: "Create",
        link: "/admin/tickets/create",
      },
      {
        text: "Daily Schedule",
        link: "/admin/tickets/daily-schedule",
      },
      {
        text: "Team Roster",
        link: "/admin/tickets/daily-roster",
      },
      {
        text: "Closed",
        link: "/admin/tickets/closed",
      },
      {
        text: "Installations",
        active: false,
        subMenu: [
          {
            text: "Active",
            link: "/admin/tickets/installations",
          },
          {
            text: "Archived",
            link: "/admin/tickets/installations/archived",
          },
        ],
      },
      {
        text: "Router Numbers",
        link: "/admin/tickets/routers",
      },
      {
        text: "Archive",
        link: "/admin/tickets/archive",
      },
      {
        text: "Reports",
        active: false,
        subMenu: [
          {
            text: "Tickets Report",
            link: "/admin/tickets/reports",
          },
          {
            text: "LOS Full Report",
            link: "/admin/tickets/reports/los",
          },
          {
            text: "Installation Full Report",
            link: "/admin/tickets/reports/installations",
          },
          {
            text: "Daily Reports Management",
            link: "/admin/tickets/reports/management",
          },
        ],
      },
    ],
  },
  {
    icon: "wallet",
    text: "Finance",
    active: false,
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/finance/dashboard",
      },
      {
        text: "Invoices",
        link: "/admin/finance/invoices",
      },
      {
        text: "Payments",
        link: "/admin/finance/payments",
      },
      {
        text: "Mpesa",
        link: "/admin/finance/mpesa",
      },
      {
        text: "Till Payments",
        active: false,
        subMenu: [
          {
            text: "Dashboard",
            link: "/admin/finance/till-payments",
          },
          {
            text: "Router change",
            link: "/admin/finance/till-payments/router-change",
          },
          {
            text: "Relocation",
            link: "/admin/finance/till-payments/relocation",
          },
          {
            text: "Extension",
            link: "/admin/finance/till-payments/extension",
          },
        ],
      },
      {
        text: "M-Pesa Tracker",
        link: "/admin/finance/mpesa-tracker",
      },
      {
        text: "New Customers",
        link: "/admin/finance/new-customers",
      },
      {
        text: "Manual Payments",
        link: "/admin/finance/manual-payments",
      },
      {
        text: "Financial Report",
        link: "/admin/finance/report",
      },
      // Documents (quotations / invoices / letterhead) — hidden until backend is ready
      // {
      //   text: "Documents",
      //   active: false,
      //   subMenu: [
      //     {
      //       text: "Quotation",
      //       link: "/admin/finance/documents/quotations",
      //     },
      //     {
      //       text: "Invoice",
      //       link: "/admin/finance/documents/invoices",
      //     },
      //     {
      //       text: "Company Letter Head",
      //       link: "/admin/finance/documents/letterhead",
      //     },
      //   ],
      // },
    ],
  },
  {
    icon: "wifi",
    text: "Hotspot",
    active: false,
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/hotspot/dashboard",
      },
      {
        text: "Auth locations",
        link: "/admin/hotspot/auth-locations",
      },
      {
        text: "Users",
        link: "/admin/hotspot/users",
      },
      {
        text: "Sessions",
        link: "/admin/hotspot/sessions",
      },
      {
        text: "Logs",
        link: "/admin/hotspot/logs",
      },
    ],
  },
  {
    icon: "msg",
    text: "Bulk SMS",
    active: false,
    subMenu: [
      {
        text: "Outbox",
        link: "/admin/sms/outbox",
      },
      {
        text: "Send Single Sms",
        link: "/admin/sms/send-single",
      },
      {
        text: "Send Group Sms",
        link: "/admin/sms/send-group",
      },
      {
        text: "Send Bulk Sms",
        link: "/admin/sms/send-bulk",
      },
      {
        text: "Reports",
        link: "/admin/sms/reports",
      },
    ],
  },
  {
    icon: "whatsapp",
    text: "WhatsApp",
    active: false,
    subMenu: [
      {
        text: "Outbox",
        link: "/admin/whatsapp/outbox",
      },
      {
        text: "Inbox",
        link: "/admin/whatsapp/inbox",
      },
      {
        text: "Send Single",
        link: "/admin/whatsapp/send-single",
      },
      {
        text: "Send Group",
        link: "/admin/whatsapp/send-group",
      },
      {
        text: "Send Bulk",
        link: "/admin/whatsapp/send-bulk",
      },
      {
        text: "Reports",
        link: "/admin/whatsapp/reports",
      },
    ],
  },
  {
    heading: "Company",
  },
  {
    icon: "package",
    text: "Inventory",
    active: false,
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/inventory/dashboard",
      },
      {
        text: "List",
        link: "/admin/inventory/list",
      },
      {
        text: "Disbursement",
        link: "/admin/inventory/disbursed",
      },
      {
        text: "Assignment History",
        link: "/admin/inventory/assignment-history",
      },
      {
        text: "Discarded Cable",
        link: "/admin/inventory/discarded",
      },
      {
        text: "Cable Roll Usage",
        link: "/admin/inventory/cable-usage",
      },
      {
        text: "Item Usage Logs",
        link: "/admin/inventory/item-logs",
      },
    ],
  },
  {
    icon: "truck",
    text: "Fleet",
    active: false,
    subMenu: [
      {
        text: "Vehicles & Team",
        link: "/admin/fleet",
      },
      {
        text: "Fuel & Care",
        link: "/admin/fleet/care",
      },
      {
        text: "Fleet Management",
        link: "/admin/fleet/dashboard",
      },
    ],
  },
  {
    icon: "network",
    text: "Networking",
    active: false,
    subMenu: [
      {
        text: "Routers",
        active: false,
        subMenu: [
          {
            text: "Add",
            link: "/admin/networking/routers/add",
          },
          {
            text: "List",
            link: "/admin/networking/routers/list",
          },
          {
            text: "Bandwidth",
            link: "/admin/networking/routers/bandwidth",
          },
        ],
      },
      {
        text: "IPv4 addresses",
        active: false,
        subMenu: [
          {
            text: "Dashboard",
            link: "/admin/networking/ipv4/dashboard",
          },
          {
            text: "Add",
            link: "/admin/networking/ipv4/add",
          },
          {
            text: "List",
            link: "/admin/networking/ipv4/list",
          },
        ],
      },
      {
        text: "VPN",
        active: false,
        subMenu: [
          {
            text: "Dashboard",
            link: "/admin/networking/vpn/dashboard",
          },
          {
            text: "Add",
            link: "/admin/networking/vpn/add",
          },
          {
            text: "List",
            link: "/admin/networking/vpn/list",
          },
        ],
      },
    ],
  },
  {
    icon: "activity",
    text: "OLT monitoring",
    link: "/admin/company/olt-monitoring",
  },
  {
    icon: "setting",
    text: "TR069",
    link: "/admin/company/tr069",
  },
  {
    icon: "mobile",
    text: "Mobile",
    link: "/admin/company/mobile",
  },
  {
    icon: "globe",
    text: "Tariff plans",
    active: false,
    subMenu: [
      {
        text: "Internet",
        link: "/admin/tariffs/internet",
      },
      {
        text: "Package Usage",
        link: "/admin/tariffs/package-usage",
      },
      {
        text: "Recurring",
        link: "/admin/tariffs/recurring",
      },
      {
        text: "Prepaid",
        link: "/admin/tariffs/prepaid",
      },
    ],
  },
  {
    icon: "briefcase",
    text: "Company Profile",
    link: "/admin/company/profile",
  },
  {
    heading: "System",
  },
  {
    icon: "file-docs",
    text: "ICT Daily Report",
    link: "/admin/ict/daily-report",
  },
  {
    icon: "trash",
    text: "Delete Approvals",
    link: "/admin/administration/deletion-approvals",
  },
  {
    icon: "user-list",
    text: "Administration",
    link: "/admin/administration",
  },
  {
    icon: "opt-dot-alt",
    text: "Config",
    link: "/admin/invest",
  },
];
export default menu;
