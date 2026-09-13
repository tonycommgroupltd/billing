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
    ],
  },
  {
    icon: "network",
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
    ],
  },
  {
    icon: "package",
    text: "My Inventory",
    active: false,
    subMenu: [
      {
        text: "My Items",
        link: "/admin/inventory/my-items",
      },
      {
        text: "All Inventory",
        link: "/admin/inventory/list",
      },
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
