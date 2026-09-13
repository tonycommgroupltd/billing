import React from "react";
import { Link } from "react-router-dom";
import classNames from "classnames";
import Toggle from "../sidebar/Toggle";
import Logo from "../logo/Logo";
import User from "./dropdown/user/User";
import Notification from "./dropdown/notification/Notification";
import HistoryNav from "./HistoryNav";
import QuickAddition from "./QuickAddition";
import Icon from "../../components/icon/Icon";

const Header = ({
  fixed,
  theme,
  className,
  setVisibility,
  sidebarCompact,
  onSidebarCompact,
  ...props
}) => {
  const headerClass = classNames({
    "nk-header": true,
    "nk-header-fixed": fixed,
    "splynx-header": true,
    [`is-light`]: theme === "white",
    [`is-${theme}`]: theme !== "white" && theme !== "light",
    [`${className}`]: className,
  });

  return (
    <div className={headerClass}>
      <div className="container-fluid">
        <div className="nk-header-wrap splynx-header-inner">
          <div className="splynx-header-left">
            <div className="nk-menu-trigger d-xl-none ms-n1">
              <Toggle
                className="nav-toggler nk-nav-toggle nk-quick-nav-icon d-xl-none ms-n1"
                icon="menu"
                click={props.sidebarToggle}
              />
            </div>
            <div className="nk-menu-trigger d-none d-xl-inline-flex">
              <Toggle
                className={`nav-toggler nk-nav-compact nk-quick-nav-icon ${
                  sidebarCompact ? "compact-active" : ""
                }`}
                icon="chevron-left"
                click={onSidebarCompact}
              />
            </div>
            <div className="splynx-logo nk-header-brand">
              <Logo />
            </div>
            <HistoryNav />
          </div>

          <ul className="navigation nk-quick-nav splynx-header-actions">
            <li className="splynx-header-action" id="quick-addition">
              <QuickAddition />
            </li>
            <li className="splynx-header-action">
              <Link
                to={`${process.env.PUBLIC_URL}/admin/tickets/list`}
                className="nk-quick-nav-icon"
                title="Tickets"
              >
                <Icon name="ticket" />
              </Link>
            </li>
            <li className="splynx-header-action notification-main">
              <Notification />
            </li>
            <li className="user-dropdown dropdown" onClick={() => setVisibility(false)}>
              <User />
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Header;
