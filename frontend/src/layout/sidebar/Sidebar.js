import React, { useState } from "react";
import classNames from "classnames";
import SimpleBar from "simplebar-react";
import Menu from "../menu/Menu";

const Sidebar = ({
  fixed,
  theme,
  className,
  sidebarToggle,
  mobileView,
  isCompact = false,
  ...props
}) => {
  const [mouseEnter, setMouseEnter] = useState(false);

  const handleMouseEnter = () => setMouseEnter(true);
  const handleMouseLeave = () => setMouseEnter(false);

  const classes = classNames({
    "nk-sidebar": true,
    "splynx-sidebar": true,
    "nk-sidebar-fixed": fixed,
    "is-compact": isCompact,
    "has-hover": isCompact && mouseEnter,
    [`is-light`]: theme === "white",
    [`is-${theme}`]: theme !== "white" && theme !== "light",
    [`${className}`]: className,
  });

  return (
    <div className={classes}>
      <div className="nk-sidebar-content" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <SimpleBar className="nk-sidebar-menu">
          <Menu sidebarToggle={sidebarToggle} mobileView={mobileView} />
        </SimpleBar>
      </div>
    </div>
  );
};
export default Sidebar;
