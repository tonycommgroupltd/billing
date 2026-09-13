import React from "react";
import { NavLink } from "react-router-dom";
import { connect } from "react-redux";
import { canSeeAllFleetNav } from "../../utils/fleetAccess";

const CORE_LINKS = [
  { to: "/admin/fleet", label: "Vehicles & Team", short: "Team" },
  { to: "/admin/fleet/care", label: "Fuel & Care", short: "Care" },
];

const MANAGER_LINKS = [
  { to: "/admin/fleet/dashboard", label: "Management", short: "Manage" },
];

const FleetNav = ({ user }) => {
  const showAllFleetLinks = canSeeAllFleetNav(user);
  const links = showAllFleetLinks ? [...CORE_LINKS, ...MANAGER_LINKS] : CORE_LINKS;

  return (
    <nav className="fleet-subnav" aria-label="Fleet sections">
      {links.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/admin/fleet"}
          className={({ isActive }) =>
            `fleet-subnav__link${isActive ? " fleet-subnav__link--active" : ""}`
          }
        >
          <span className="fleet-subnav__full">{item.label}</span>
          <span className="fleet-subnav__short">{item.short}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default connect((state) => ({ user: state.auth.currentUser }))(FleetNav);
