const menu = [
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
        text: "My Leads",
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
    heading: "Company",
    roles: ["technician", "engineer"],
  },
  {
    icon: "package",
    text: "My Inventory",
    active: false,
    roles: ["technician", "engineer"],
    subMenu: [
      {
        text: "My Items",
        link: "/admin/inventory/my-items",
        roles: ["technician", "engineer"],
      },
      {
        text: "All Inventory",
        link: "/admin/inventory/list",
        roles: ["technician", "engineer"],
      },
    ],
  },
  {
    icon: "truck",
    text: "Fleet",
    active: false,
    roles: ["technician", "engineer"],
    subMenu: [
      {
        text: "Vehicles & Team",
        link: "/admin/fleet",
        roles: ["technician", "engineer"],
      },
      {
        text: "Daily Log",
        link: "/admin/fleet/log",
        roles: ["technician", "engineer"],
      },
    ],
  },
];

export default menu;
