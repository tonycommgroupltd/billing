const menu = [
  {
    icon: "dashboard",
    text: "Dashboard",
    link: "/",
  },
  {
    heading: "CRM",
  },
  /*
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
    ],
  },
  */
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
        text: "All Tickets",
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
            icon: "setting",
          },
        ],
      },
    ],
  },
  // Bonus system disabled
  // {
  //   icon: "award",
  //   text: "Technician Bonuses",
  //   active: false,
  //   subMenu: [
  //     { text: "Bonus Dashboard", link: "/admin/bonus/dashboard" },
  //     { text: "Bonus Summary", link: "/admin/bonus/summary" },
  //     { text: "Payment History", link: "/admin/bonus/history" },
  //   ],
  // },
  {
    icon: "wifi",
    text: "Hotspot",
    link: "/admin/hotspot",
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
        text: "Billing Change Tracker",
        link: "/admin/finance/expired-accounts-tracker",
      },
      // {
      //   text: "Payments",
      //   link: "/admin/finance/payments",
      // },
      // {
      //   text: "Invoices",
      //   link: "/admin/finance/invoices",
      // },
      // {
      //   text: "Mpesa",
      //   link: "/admin/finance/mpesa",
      // },
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
      {
        text: "Tonycomm DB",
        link: "/admin/finance/backup-sync",
      },
      {
        text: "KRA Operations",
        link: "/admin/finance/kra-operations",
      },
      {
        text: "KRA Auto Invoicing",
        link: "/admin/finance/kra-auto",
      },
      {
        text: "KRA Receipt Sample",
        link: "/admin/finance/kra-receipt-preview",
      },
    ],
  },
  {
    icon: "msg",
    text: "Bulk SMS",
    active: false,
    subMenu: [
      // {
      //   text: "Dashboard",
      //   link: "/admin/sms/dashboard",
      // },
      {
        text: "Outbox",
        link: "/admin/sms/outbox",
      },
      // {
      //   text: "Send Single SMS",
      //   link: "/admin/sms/send-single",
      // },
      // {
      //   text: "Send Group SMS",
      //   link: "/admin/sms/send-group",
      // },
      {
        text: "Send Bulk SMS",
        link: "/admin/sms/send-bulk",
      },
      // {
      //   text: "Reports",
      //   link: "/admin/sms/reports",
      // },
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
    ],
  },
  {
    heading: "Company",
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
        ],
      },
      {
        text: "Fiber Structure",
        active: false,
        subMenu: [
          {
            text: "Network Map",
            link: "/admin/networking/fiber/map",
          },
          {
            text: "FAT Points",
            link: "/admin/networking/fiber/fat",
          },
          {
            text: "Closures",
            link: "/admin/networking/fiber/closures",
          },
          {
            text: "Infrastructure",
            link: "/admin/networking/fiber/infrastructure",
          },
          {
            text: "Import GeoJSON",
            link: "/admin/networking/fiber/import-geojson",
          },
        ],
      },
    ],
  },
  /*
  {
    icon: "globe",
    text: "Tariff plans",
    active: false,
    subMenu: [
      {
        text: "Internet",
        link: "/admin/tariffs/internet",
      },
    ],
  },
  */
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
    icon: "users",
    text: "Customer Services",
    link: "/admin/splynx-data",
  },
  // {
  //   icon: "alert-circle",
  //   text: "Expired Accounts",
  //   link: "/admin/expired-accounts",
  // },
  {
    heading: "System",
  },
  {
    icon: "activity",
    text: "Activity Logs",
    link: "/admin/logs/list",
    roles: ["administrator", "super-administrator", "manager"],
  },
  {
    icon: "users",
    text: "Active Users",
    link: "/admin/logs/active-users",
    roles: ["administrator", "super-administrator", "manager"],
  },
  {
    icon: "user-list",
    text: "Administration",
    link: "/admin/administration",
  },
  /*
  {
    icon: "opt-dot-alt",
    text: "Config",
    link: "/admin/invest",
  },
  */
];
export default menu;
