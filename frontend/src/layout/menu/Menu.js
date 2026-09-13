import React from "react";
import Icon from "../../components/icon/Icon";
import classNames from "classnames";
import { NavLink, Link, useLocation } from "react-router-dom";
import { connect } from "react-redux";
import { groupMenuBySection } from "./menuSections";
import { hasActiveDescendant, isMenuLinkActive } from "./menuRouteUtils";
import { getMenuForUser } from "./menuForUser";
import {
  MenuAccordionProvider,
  makeTopMenuKey,
  useMenuAccordion,
} from "./MenuAccordionContext";

const MenuHeading = ({ heading, color = "secondary" }) => (
  <span className={`menu-block-title color-${color}`}>{heading || null}</span>
);

const MenuItem = ({
  icon,
  link,
  text,
  sub,
  newTab,
  sidebarToggle,
  mobileView,
  badge,
  sectionColor = "secondary",
  level = 1,
  menuKey = null,
  as = "li",
}) => {
  const accordion = useMenuAccordion();
  const location = useLocation();
  const pathname = location.pathname;
  const isCurrentPage = Boolean(link && isMenuLinkActive(pathname, link));
  const childRouteActive = Boolean(sub && hasActiveDescendant(sub, pathname));
  const [open, setOpen] = React.useState(false);
  const isTopLevel = level === 1;
  const ItemTag = as === "div" ? "div" : "li";

  React.useEffect(() => {
    if (!isTopLevel && childRouteActive) setOpen(true);
  }, [childRouteActive, pathname, isTopLevel]);

  const isExpanded = Boolean(
    sub &&
      (isTopLevel
        ? accordion?.openTopKey === menuKey
        : open || childRouteActive)
  );

  const toggleActionSidebar = () => {
    // Close mobile drawer after a leaf click — do not pass the click event
    // (preventDefault on that event cancelled NavLink navigation).
    if (!sub && !newTab && mobileView) {
      sidebarToggle();
    }
  };

  const menuToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!sub) return;

    if (isExpanded) {
      if (isTopLevel && accordion) {
        accordion.setOpenTopKey(null);
      } else {
        setOpen(false);
      }
      return;
    }

    if (isTopLevel && accordion) {
      accordion.setOpenTopKey(menuKey);
    } else {
      setOpen(true);
    }
  };

  const menuItemClass = classNames({
    "nk-menu-item": true,
    "menu-item": true,
    [`menu-item-level-${level}`]: true,
    [`color-${sectionColor}`]: true,
    "has-sub": sub,
    "has-dropdown": sub,
    active: isExpanded,
    "active-item": isCurrentPage,
    "current-page": isCurrentPage,
    "route-active": childRouteActive && !isCurrentPage,
  });

  const colorClass = `color-${sectionColor}`;

  const linkClass = ({ isActive } = {}) =>
    classNames("nk-menu-link", colorClass, {
      "nk-menu-toggle": sub,
      active: isActive || isCurrentPage,
    });

  const linkBody = (
    <>
      {icon ? (
        <span className="nk-menu-icon btn-icon-sm main-icon" data-test-selector="icon-item">
          <Icon name={icon} />
        </span>
      ) : null}
      <span className="nk-menu-text item-title">{text}</span>
      {badge ? <span className="nk-menu-badge">{badge}</span> : null}
      {sub ? (
        <span
          className="menu-chevron btn-icon-sm button-close"
          data-test-selector="arrow-down"
          aria-hidden="true"
        >
          <Icon name="chevron-down" />
        </span>
      ) : null}
    </>
  );

  return (
    <ItemTag className={menuItemClass} onClick={toggleActionSidebar}>
      {newTab ? (
        <Link
          to={`${process.env.PUBLIC_URL + link}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass()}
        >
          {linkBody}
        </Link>
      ) : sub && !link ? (
        <a
          href="#menu"
          className={linkClass()}
          onClick={menuToggle}
          aria-expanded={isExpanded}
        >
          {linkBody}
        </a>
      ) : (
        <NavLink
          to={`${process.env.PUBLIC_URL + link}`}
          className={linkClass}
          onClick={sub ? menuToggle : undefined}
          end={!sub && link === "/"}
          aria-expanded={sub ? isExpanded : undefined}
        >
          {linkBody}
        </NavLink>
      )}
      {sub ? (
        <div className="nk-menu-wrap" aria-hidden={!isExpanded}>
          <MenuSub
            sub={sub}
            sidebarToggle={sidebarToggle}
            mobileView={mobileView}
            sectionColor={sectionColor}
            level={level + 1}
          />
        </div>
      ) : null}
    </ItemTag>
  );
};

const MenuSub = ({ sub, sidebarToggle, mobileView, sectionColor, level = 2 }) => {
  return (
    <ul className="nk-menu-sub">
      {sub.map((item) => (
        <MenuItem
          link={item.link}
          icon={item.icon}
          text={item.text}
          sub={item.subMenu}
          key={item.text}
          newTab={item.newTab}
          badge={item.badge}
          sidebarToggle={sidebarToggle}
          mobileView={mobileView}
          sectionColor={sectionColor}
          level={level}
          as="li"
        />
      ))}
    </ul>
  );
};

const Menu = ({ sidebarToggle, mobileView, user }) => {
  const { all_roles = [] } = user;
  const location = useLocation();
  const filteredMenu = getMenuForUser(all_roles);
  const sections = groupMenuBySection(filteredMenu);

  // Flatten to Splynx shape: each top item in its own data-test-selector wrapper;
  // section title only on the first item of that section.
  const topEntries = [];
  sections.forEach((section) => {
    section.items.forEach((item, index) => {
      topEntries.push({
        item,
        section,
        showHeading: index === 0,
      });
    });
  });

  return (
    <MenuAccordionProvider sections={sections} pathname={location.pathname}>
      <div className="menu-list">
        {topEntries.map(({ item, section, showHeading }) => (
          <div data-test-selector={item.text} key={`${section.heading || "main"}-${item.text}`}>
            {showHeading ? (
              section.heading ? (
                <MenuHeading heading={section.heading} color={section.color} />
              ) : (
                <span
                  className={`menu-block-title color-${section.color} menu-block-title--spacer`}
                  aria-hidden="true"
                />
              )
            ) : null}
            <MenuItem
              link={item.link}
              icon={item.icon}
              text={item.text}
              sub={item.subMenu}
              badge={item.badge}
              sidebarToggle={sidebarToggle}
              mobileView={mobileView}
              sectionColor={section.color}
              menuKey={makeTopMenuKey(section.heading, item.text)}
              as="div"
            />
          </div>
        ))}
      </div>
    </MenuAccordionProvider>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(Menu);
