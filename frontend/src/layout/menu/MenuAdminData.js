const menu = [
  {
    icon: "dashboard",
    text: "Dashboard",
    link: "/",
    roles: ["administrator", "manager", "financial-manager", "customer-care"],
  },
  {
    icon: "chat-circle-fill",
    text: "AI Buddy",
    link: "/admin/ai-diagnostics",
    roles: ["administrator", "manager", "customer-care"],
  },
  {
    heading: "CRM",
    roles: ["administrator", "manager", "financial-manager", "customer-care"],
  },
  {
    icon: "users",
    text: "Customers",
    active: false,
    roles: ["administrator", "manager", "financial-manager", "customer-care"],
    subMenu: [
      {
        text: "Add",
        link: "/admin/customers/add",
        roles: ["administrator", "manager", "financial-manager", "customer-care"],
      },
      {
        text: "Online",
        link: "/admin/customers/online",
        roles: ["administrator", "manager", "financial-manager", "customer-care"],
      },
      {
        text: "List",
        link: "/admin/customers/list",
        roles: ["administrator", "manager", "financial-manager", "customer-care"],
      },
      {
        text: "Unconfigured",
        link: "/admin/customers/unconfigured",
        roles: ["administrator", "manager", "financial-manager", "customer-care"],
      },
      {
        text: "SmartOLT",
        link: "/admin/customers/smartolt",
        roles: ["administrator", "manager"],
      },
    ],
  },
  {
    icon: "user-list",
    text: "Leads",
    active: false,
    roles: ["administrator", "manager", "customer-care"],
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/leads/dashboard",
        roles: ["administrator", "manager", "customer-care"],
      },
      {
        text: "Add Lead",
        link: "/admin/leads/add",
        roles: ["administrator", "manager", "customer-care"],
      },
      {
        text: "All Leads",
        link: "/admin/leads/list",
        roles: ["administrator", "manager", "customer-care"],
      },
    ],
  },
  {
    icon: "ticket",
    text: "Tickets",
    active: false,
    roles: ["administrator", "manager"],
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/tickets/dashboard",
        roles: ["administrator", "manager"],
      },
      {
        text: "List",
        link: "/admin/tickets/list",
        roles: ["administrator", "manager"],
      },
      {
        text: "Create",
        link: "/admin/tickets/create",
        roles: ["administrator", "manager"],
      },
      {
        text: "Daily Schedule",
        link: "/admin/tickets/daily-schedule",
        roles: ["administrator", "manager"],
      },
      {
        text: "Team Roster",
        link: "/admin/tickets/daily-roster",
        roles: ["administrator", "manager"],
      },
      {
        text: "Closed",
        link: "/admin/tickets/closed",
        roles: ["administrator", "manager"],
      },
      {
        text: "Installations",
        active: false,
        roles: ["administrator", "manager"],
        subMenu: [
          {
            text: "Active",
            link: "/admin/tickets/installations",
            roles: ["administrator", "manager"],
          },
          {
            text: "Archived",
            link: "/admin/tickets/installations/archived",
            roles: ["administrator", "manager"],
          },
        ],
      },
      {
        text: "Router Numbers",
        link: "/admin/tickets/routers",
        roles: ["administrator", "manager"],
      },
      {
        text: "Archive",
        link: "/admin/tickets/archive",
        roles: ["administrator", "manager"],
      },
      {
        text: "Reports",
        active: false,
        roles: ["administrator", "manager"],
        subMenu: [
          {
            text: "Tickets Report",
            link: "/admin/tickets/reports",
            roles: ["administrator", "manager"],
          },
          {
            text: "LOS Full Report",
            link: "/admin/tickets/reports/los",
            roles: ["administrator", "manager"],
          },
          {
            text: "Installation Full Report",
            link: "/admin/tickets/reports/installations",
            roles: ["administrator", "manager"],
          },
          {
            text: "Daily Reports Management",
            link: "/admin/tickets/reports/management",
            roles: ["administrator", "manager"],
          },
        ],
      },
    ],
  },
  {
    icon: "wallet",
    text: "Finance",
    active: false,
    roles: ["administrator", "manager", "financial-manager"],
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/finance/dashboard",
        roles: ["administrator", "financial-manager"],
      },
      {
        text: "Invoices",
        link: "/admin/finance/invoices",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Payments",
        link: "/admin/finance/payments",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Mpesa",
        link: "/admin/finance/mpesa",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Till Payments",
        active: false,
        roles: ["administrator", "manager", "financial-manager"],
        subMenu: [
          {
            text: "Dashboard",
            link: "/admin/finance/till-payments",
            roles: ["administrator", "manager", "financial-manager"],
          },
          {
            text: "Router change",
            link: "/admin/finance/till-payments/router-change",
            roles: ["administrator", "manager", "financial-manager"],
          },
          {
            text: "Relocation",
            link: "/admin/finance/till-payments/relocation",
            roles: ["administrator", "manager", "financial-manager"],
          },
          {
            text: "Extension",
            link: "/admin/finance/till-payments/extension",
            roles: ["administrator", "manager", "financial-manager"],
          },
        ],
      },
      {
        text: "M-Pesa Tracker",
        link: "/admin/finance/mpesa-tracker",
        // Hidden from administrator — super-admin/ICT use MenuData; fin-manager keeps access
        roles: ["financial-manager"],
      },
      {
        text: "New Customers",
        link: "/admin/finance/new-customers",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Manual Payments",
        link: "/admin/finance/manual-payments",
        roles: ["administrator", "financial-manager"],
      },
      {
        text: "Financial Report",
        link: "/admin/finance/report",
        // Hidden from administrator — super-admin/ICT use MenuData; fin-manager keeps access
        roles: ["financial-manager"],
      },
      // Documents (quotations / invoices / letterhead) — hidden until backend is ready
      // {
      //   text: "Documents",
      //   active: false,
      //   roles: ["administrator", "manager", "financial-manager"],
      //   subMenu: [
      //     {
      //       text: "Quotation",
      //       link: "/admin/finance/documents/quotations",
      //       roles: ["administrator", "manager", "financial-manager"],
      //     },
      //     {
      //       text: "Invoice",
      //       link: "/admin/finance/documents/invoices",
      //       roles: ["administrator", "manager", "financial-manager"],
      //     },
      //     {
      //       text: "Company Letter Head",
      //       link: "/admin/finance/documents/letterhead",
      //       roles: ["administrator", "manager", "financial-manager"],
      //     },
      //   ],
      // },
    ],
  },
  {
    icon: "wifi",
    text: "Hotspot",
    active: false,
    roles: ["administrator", "manager"],
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/hotspot/dashboard",
        roles: ["administrator", "manager"],
      },
      {
        text: "Users",
        link: "/admin/hotspot/users",
        roles: ["administrator", "manager"],
      },
      {
        text: "Sessions",
        link: "/admin/hotspot/sessions",
        roles: ["administrator", "manager"],
      },
      {
        text: "Logs",
        link: "/admin/hotspot/logs",
        roles: ["administrator", "manager"],
      },
    ],
  },
  {
    icon: "msg",
    text: "Bulk SMS",
    active: false,
    roles: ["administrator", "manager", "financial-manager"],
    subMenu: [
      {
        text: "Outbox",
        link: "/admin/sms/outbox",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Send Single Sms",
        link: "/admin/sms/send-single",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Send Group Sms",
        link: "/admin/sms/send-group",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Send Bulk Sms",
        link: "/admin/sms/send-bulk",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Reports",
        link: "/admin/sms/reports",
        roles: ["administrator", "manager", "financial-manager"],
      },
    ],
  },
  {
    icon: "whatsapp",
    text: "WhatsApp",
    active: false,
    roles: ["administrator", "manager"],
    subMenu: [
      {
        text: "Outbox",
        link: "/admin/whatsapp/outbox",
        roles: ["administrator", "manager"],
      },
      {
        text: "Inbox",
        link: "/admin/whatsapp/inbox",
        roles: ["administrator", "manager"],
      },
      {
        text: "Send Single",
        link: "/admin/whatsapp/send-single",
        roles: ["administrator", "manager"],
      },
      {
        text: "Send Group",
        link: "/admin/whatsapp/send-group",
        roles: ["administrator", "manager"],
      },
      {
        text: "Send Bulk",
        link: "/admin/whatsapp/send-bulk",
        roles: ["administrator", "manager"],
      },
      {
        text: "Reports",
        link: "/admin/whatsapp/reports",
        roles: ["administrator", "manager"],
      },
    ],
  },
  {
    heading: "Company",
    roles: ["administrator", "manager", "financial-manager"],
  },
  {
    icon: "package",
    text: "Inventory",
    active: false,
    roles: ["administrator", "manager"],
    subMenu: [
      {
        text: "Dashboard",
        link: "/admin/inventory/dashboard",
        roles: ["administrator", "manager"],
      },
      {
        text: "List",
        link: "/admin/inventory/list",
        roles: ["administrator", "manager"],
      },
      {
        text: "Disbursement",
        link: "/admin/inventory/disbursed",
        roles: ["administrator", "manager"],
      },
      {
        text: "Assignment History",
        link: "/admin/inventory/assignment-history",
        roles: ["administrator", "manager"],
      },
      {
        text: "Discarded Cable",
        link: "/admin/inventory/discarded",
        roles: ["administrator", "manager"],
      },
      {
        text: "Cable Roll Usage",
        link: "/admin/inventory/cable-usage",
        roles: ["administrator", "manager"],
      },
      {
        text: "Item Usage Logs",
        link: "/admin/inventory/item-logs",
        roles: ["administrator", "manager"],
      },
    ],
  },
  {
    icon: "truck",
    text: "Fleet",
    active: false,
    roles: ["administrator", "manager"],
    subMenu: [
      {
        text: "Vehicles & Team",
        link: "/admin/fleet",
        roles: ["administrator", "manager"],
      },
      {
        text: "Fuel & Care",
        link: "/admin/fleet/care",
        roles: ["administrator", "manager"],
      },
      {
        text: "Fleet Management",
        link: "/admin/fleet/dashboard",
        roles: ["administrator", "manager"],
      },
    ],
  },
  {
    icon: "network",
    text: "Networking",
    active: false,
    roles: ["administrator", "manager"],
    subMenu: [
      {
        text: "Routers",
        active: false,
        roles: ["administrator", "manager"],
        subMenu: [
          {
            text: "Add",
            link: "/admin/networking/routers/add",
            roles: ["administrator", "manager"],
          },
          {
            text: "List",
            link: "/admin/networking/routers/list",
            roles: ["administrator", "manager"],
          },
          {
            text: "Bandwidth",
            link: "/admin/networking/routers/bandwidth",
            roles: ["administrator", "manager"],
          },
        ],
      },
      {
        text: "IPv4 addresses",
        active: false,
        roles: ["administrator", "manager"],
        subMenu: [
          {
            text: "Dashboard",
            link: "/admin/networking/ipv4/dashboard",
            roles: ["administrator", "manager"],
          },
          {
            text: "Add",
            link: "/admin/networking/ipv4/add",
            roles: ["administrator", "manager"],
          },
          {
            text: "List",
            link: "/admin/networking/ipv4/list",
            roles: ["administrator", "manager"],
          },
        ],
      },
      {
        text: "VPN",
        active: false,
        roles: ["administrator", "manager"],
        subMenu: [
          {
            text: "Dashboard",
            link: "/admin/networking/vpn/dashboard",
            roles: ["administrator", "manager"],
          },
          {
            text: "Add",
            link: "/admin/networking/vpn/add",
            roles: ["administrator", "manager"],
          },
          {
            text: "List",
            link: "/admin/networking/vpn/list",
            roles: ["administrator", "manager"],
          },
        ],
      },
    ],
  },
  {
    icon: "activity",
    text: "OLT monitoring",
    link: "/admin/company/olt-monitoring",
    roles: ["administrator", "manager"],
  },
  {
    icon: "setting",
    text: "TR069",
    link: "/admin/company/tr069",
    roles: ["administrator", "manager"],
  },
  {
    icon: "mobile",
    text: "Mobile",
    link: "/admin/company/mobile",
    roles: ["administrator", "ict", "manager"],
  },
  {
    icon: "globe",
    text: "Tariff plans",
    active: false,
    roles: ["administrator", "manager", "financial-manager"],
    subMenu: [
      {
        text: "Internet",
        link: "/admin/tariffs/internet",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Package Usage",
        link: "/admin/tariffs/package-usage",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Recurring",
        link: "/admin/tariffs/recurring",
        roles: ["administrator", "manager", "financial-manager"],
      },
      {
        text: "Prepaid",
        link: "/admin/tariffs/prepaid",
        roles: ["administrator", "manager", "financial-manager"],
      },
    ],
  },
  {
    icon: "briefcase",
    text: "Company Profile",
    link: "/admin/company/profile",
    roles: ["administrator", "manager", "super-administrator", "ict", "financial-manager"],
  },
  {
    heading: "ICT / Approvals",
    roles: ["administrator", "manager"],
  },
  {
    icon: "file-docs",
    text: "ICT Daily Report",
    link: "/admin/ict/daily-report",
    roles: ["administrator", "manager"],
  },
  {
    icon: "trash",
    text: "My Delete Requests",
    link: "/admin/administration/deletion-approvals",
    roles: ["administrator", "manager", "financial-manager", "customer-care"],
  },
];
export default menu;
