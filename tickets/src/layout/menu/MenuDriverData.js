const menu = [
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
  {
    icon: "network",
    text: "Navigation",
    active: false,
    subMenu: [
      { text: "Network Map", link: "/admin/networking/fiber/map" },
    ],
  },
];

export default menu;
