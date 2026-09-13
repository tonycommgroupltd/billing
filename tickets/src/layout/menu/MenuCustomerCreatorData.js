const menu = [
  {
    icon: "user-list",
    text: "Customer Creater",
    active: false,
    subMenu: [
      { text: "Dashboard", link: "/admin/customer-creater/dashboard" },
      { text: "Add", link: "/admin/customer-creater/add" },
      { text: "My Customers", link: "/admin/customer-creater/list" },
    ],
  },
  {
    icon: "ticket",
    text: "Tickets",
    active: false,
    subMenu: [
      { text: "Dashboard", link: "/admin/tickets/dashboard" },
      { text: "All Tickets", link: "/admin/tickets/list" },
      { text: "Closed", link: "/admin/tickets/closed" },
      {
        text: "Installations",
        subMenu: [
          { text: "Active", link: "/admin/tickets/installations" },
          { text: "Archived", link: "/admin/tickets/installations/archived" },
        ],
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
];
export default menu;
