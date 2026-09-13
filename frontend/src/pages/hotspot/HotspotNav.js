import React from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "../../components/Component";

const links = [
  { to: "/admin/hotspot/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/admin/hotspot/auth-locations", label: "Auth locations", icon: "map-pin" },
  { to: "/admin/hotspot/users", label: "Users", icon: "users" },
  { to: "/admin/hotspot/sessions", label: "Sessions", icon: "wifi" },
  { to: "/admin/hotspot/logs", label: "Logs", icon: "file-text" },
];

const HotspotNav = () => (
  <div className="hotspot-nav mb-4" aria-label="Hotspot sections">
    {links.map((link) => (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) => `hotspot-nav-link${isActive ? " active" : ""}`}
      >
        <Icon name={link.icon} />
        <span>{link.label}</span>
      </NavLink>
    ))}
  </div>
);

export default HotspotNav;
