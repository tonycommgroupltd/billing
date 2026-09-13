import { sectionColor } from "./menuSections";

const publicBase = () => process.env.PUBLIC_URL || "";

export function menuHref(link) {
  if (!link) return null;
  return `${publicBase()}${link}`;
}

export function normalizePath(path) {
  if (!path) return "/";
  const p = path.split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p || "/";
}

/** True when this menu link is the current page (leaf highlight). */
export function isMenuLinkActive(pathname, link) {
  if (!link) return false;

  const path = normalizePath(pathname);
  const href = normalizePath(menuHref(link));
  const base = normalizePath(publicBase());

  // Dashboard — exact only (avoid matching every route)
  if (link === "/" || href === base || href === "/") {
    return path === "/" || path === base || path === `${base}/` || path === href;
  }

  return path === href || path.startsWith(`${href}/`);
}

export function hasActiveDescendant(items, pathname) {
  if (!Array.isArray(items) || items.length === 0) return false;

  return items.some((item) => {
    if (item.link && isMenuLinkActive(pathname, item.link)) return true;
    if (item.subMenu && hasActiveDescendant(item.subMenu, pathname)) return true;
    return false;
  });
}

/** Longest href match for auto-open (returns full href string). */
export function findBestMenuHref(pathname) {
  const path = normalizePath(pathname);
  const links = document.querySelectorAll(".nk-menu-link[href]");
  let best = null;

  links.forEach((el) => {
    const href = normalizePath(el.getAttribute("href") || "");
    if (!href) return;

    const matches =
      href === path ||
      (href !== "/" && href !== normalizePath(publicBase()) && path.startsWith(`${href}/`)) ||
      ((href === "/" || href === normalizePath(publicBase())) &&
        (path === "/" || path === normalizePath(publicBase())));

    if (matches && (!best || href.length > best.length)) {
      best = href;
    }
  });

  return best;
}

function findFirstLeafLink(items) {
  if (!Array.isArray(items)) return null;

  for (const item of items) {
    if (item.link) return item.link;
    if (item.subMenu) {
      const found = findFirstLeafLink(item.subMenu);
      if (found) return found;
    }
  }

  return null;
}

function pathDirectoryPrefix(link) {
  const href = normalizePath(menuHref(link));
  const parts = href.split("/").filter(Boolean);
  if (parts.length <= 1) return href;

  const last = parts[parts.length - 1];
  const actionSegments = new Set([
    "list",
    "add",
    "dashboard",
    "edit",
    "create",
    "view",
    "archive",
    "archived",
    "closed",
    "reports",
    "online",
    "outbox",
    "inbox",
  ]);

  if (actionSegments.has(last)) {
    return `/${parts.slice(0, -1).join("/")}`;
  }

  return href;
}

function capitalizeLabel(value) {
  if (!value) return "";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function flattenMenuCandidates(items, section = { color: "secondary" }, ancestors = [], out = []) {
  if (!Array.isArray(items)) return out;

  items.forEach((item) => {
    if (item.heading) {
      section = { color: sectionColor(item.heading) };
      return;
    }

    const crumb = {
      text: item.text,
      link: item.link || null,
      icon: item.icon || ancestors.find((a) => a.icon)?.icon || null,
    };
    const chain = [...ancestors, crumb];
    const rootIcon = chain.find((c) => c.icon)?.icon || null;

    if (item.link) {
      out.push({
        chain,
        link: item.link,
        href: normalizePath(menuHref(item.link)),
        sectionColor: section.color,
        icon: rootIcon,
      });
    }

    if (item.subMenu?.length) {
      flattenMenuCandidates(item.subMenu, section, chain, out);
    }
  });

  return out;
}

function buildCrumbItems(chain, leafHref) {
  return chain.map((crumb, index) => {
    const isLast = index === chain.length - 1;
    if (isLast) {
      return { text: crumb.text, link: null, current: true };
    }

    const href = crumb.link ? menuHref(crumb.link) : leafHref;
    return { text: crumb.text, link: href };
  });
}

function inferDynamicTitle(pathname, dirPrefix) {
  const path = normalizePath(pathname);
  const remainder = path.slice(dirPrefix.length).replace(/^\//, "");
  const segments = remainder.split("/").filter(Boolean);

  if (!segments.length) return "View";

  if (segments[0] === "view" && segments.length > 1) return "View";
  if (segments[0] === "edit") return "Edit";

  return capitalizeLabel(segments[0]);
}

/** Build Splynx-style breadcrumb trail from role-filtered menu + current path. */
export function buildBreadcrumbTrail(menuItems, pathname) {
  const path = normalizePath(pathname);
  const base = normalizePath(publicBase());
  const candidates = flattenMenuCandidates(menuItems);

  let best = null;
  candidates.forEach((candidate) => {
    if (isMenuLinkActive(pathname, candidate.link)) {
      if (!best || candidate.href.length > best.href.length) {
        best = candidate;
      }
    }
  });

  if (best) {
    const leafHref = menuHref(best.link);
    return {
      items: buildCrumbItems(best.chain, leafHref),
      sectionColor: best.sectionColor,
      icon: best.icon || "dashboard",
    };
  }

  let prefixMatch = null;
  candidates.forEach((candidate) => {
    const dir = pathDirectoryPrefix(candidate.link);
    if (path === dir || path.startsWith(`${dir}/`)) {
      if (!prefixMatch || dir.length > prefixMatch.dir.length) {
        prefixMatch = { ...candidate, dir };
      }
    }
  });

  if (prefixMatch) {
    const leafHref = menuHref(prefixMatch.link);
    const dynamicTitle = inferDynamicTitle(pathname, prefixMatch.dir);
    const chain = [...prefixMatch.chain, { text: dynamicTitle, link: null, icon: null }];
    return {
      items: buildCrumbItems(chain, leafHref),
      sectionColor: prefixMatch.sectionColor,
      icon: prefixMatch.icon || "file-docs",
    };
  }

  if (path === "/" || path === base || path === `${base}/admin` || path.endsWith("/admin")) {
    return {
      items: [{ text: "Dashboard", link: null, current: true }],
      sectionColor: "secondary",
      icon: "dashboard",
    };
  }

  const segments = path.split("/").filter(Boolean);
  const fallbackTitle = capitalizeLabel(segments[segments.length - 1] || "Page");

  return {
    items: [{ text: fallbackTitle, link: null, current: true }],
    sectionColor: "secondary",
    icon: "file-docs",
  };
}
