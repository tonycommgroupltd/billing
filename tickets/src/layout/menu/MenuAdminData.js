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
        text: "Archive",
        link: "/admin/tickets/archive",
      },
    ],
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
      { text: "Vehicles & Team", link: "/admin/fleet" },
      { text: "Fuel & Care", link: "/admin/fleet/care" },
      { text: "Fleet Management", link: "/admin/fleet/dashboard" },
    ],
  },
];
export default menu;
