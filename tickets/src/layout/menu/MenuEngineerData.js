const menu = [
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
        text: "Archive",
        link: "/admin/tickets/archive",
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
            text: "FAT List",
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
  {
    icon: "package",
    text: "Inventory",
    active: false,
    subMenu: [
      {
        text: "My Items",
        link: "/admin/inventory/my-items",
      },
      {
        text: "Dashboard",
        link: "/admin/inventory/dashboard",
      },
      {
        text: "List",
        link: "/admin/inventory/list",
      },
      {
        text: "Assignment History",
        link: "/admin/inventory/assignment-history",
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
      { text: "Vehicles & Team", link: "/admin/fleet" },
      { text: "Daily Log", link: "/admin/fleet/log" },
    ],
  },
  {
    icon: "user-list",
    text: "Customer Creator",
    active: false,
    subMenu: [
      { text: "Dashboard", link: "/admin/customer-creater/dashboard" },
      { text: "Add", link: "/admin/customer-creater/add" },
      { text: "My Customers", link: "/admin/customer-creater/list" },
    ],
  },
];
export default menu;
