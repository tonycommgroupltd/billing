import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { connect } from "react-redux";
import Icon from "../../components/icon/Icon";
import { getMenuForUser } from "../menu/menuForUser";
import { buildBreadcrumbTrail } from "../menu/menuRouteUtils";
import { useBreadcrumbContext } from "./BreadcrumbContext";

const SECTION_BG = {
  purple: "bg-purple",
  success: "bg-success",
  secondary: "bg-secondary",
};

function mergeBreadcrumbTrail(trail, override) {
  if (!override) return trail;
  if (!trail) return null;

  const items = [...(trail.items || [])];

  if (Array.isArray(override.items) && override.items.length) {
    override.items.forEach((item) => {
      const last = items[items.length - 1];
      if (last?.current) {
        items.pop();
        items.push({ text: last.text, link: last.link || item.link || null });
      }
      items.push({
        text: item.text,
        link: item.link ?? null,
        current: item.current ?? !item.link,
      });
    });
  }

  if (override.title) {
    const last = items[items.length - 1];
    if (last?.current) {
      items[items.length - 1] = { ...last, text: override.title };
    } else {
      items.push({ text: override.title, link: null, current: true });
    }
  }

  return {
    ...trail,
    icon: override.icon || trail.icon,
    sectionColor: override.sectionColor || trail.sectionColor,
    items,
  };
}

const SplynxBreadcrumbs = ({ user, hide, override: propOverride }) => {
  const location = useLocation();
  const ctx = useBreadcrumbContext();
  const override = propOverride || ctx?.override;

  const trail = useMemo(() => {
    const menuItems = getMenuForUser(user?.all_roles || []);
    const built = buildBreadcrumbTrail(menuItems, location.pathname);
    return mergeBreadcrumbTrail(built, override);
  }, [user?.all_roles, location.pathname, override]);

  if (hide || !trail?.items?.length) return null;

  const sectionColor = trail.sectionColor || "secondary";
  const iconName = trail.icon || "file-docs";
  const bgClass = SECTION_BG[sectionColor] || SECTION_BG.secondary;

  return (
    <div className="splynx-breadcrumbs">
      <span className={`splynx-breadcrumbs__icon btn-icon-lg color-white me-12 ${bgClass}`}>
        <Icon name={iconName} />
      </span>
      <ul>
        {trail.items.map((item, index) => (
          <li key={`${item.text}-${index}`} className={item.current ? "is-current" : undefined}>
            {item.link && !item.current ? (
              <Link to={item.link}>{item.text}</Link>
            ) : (
              <span>{item.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(SplynxBreadcrumbs);
