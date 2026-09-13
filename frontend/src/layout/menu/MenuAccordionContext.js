import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { hasActiveDescendant } from "./menuRouteUtils";

const MenuAccordionContext = createContext(null);

export function makeTopMenuKey(sectionHeading, text) {
  return `${sectionHeading || "main"}::${text}`;
}

export function findOpenTopLevelKey(sections, pathname) {
  if (!Array.isArray(sections)) return null;

  for (const section of sections) {
    for (const item of section.items) {
      if (item.subMenu && hasActiveDescendant(item.subMenu, pathname)) {
        return makeTopMenuKey(section.heading, item.text);
      }
    }
  }

  return null;
}

export function MenuAccordionProvider({ sections, pathname, children }) {
  const routeKey = useMemo(() => findOpenTopLevelKey(sections, pathname), [sections, pathname]);
  const [openTopKey, setOpenTopKey] = useState(routeKey);

  useEffect(() => {
    setOpenTopKey(routeKey);
  }, [routeKey, pathname]);

  const value = useMemo(
    () => ({
      openTopKey,
      setOpenTopKey,
    }),
    [openTopKey]
  );

  return <MenuAccordionContext.Provider value={value}>{children}</MenuAccordionContext.Provider>;
}

export function useMenuAccordion() {
  return useContext(MenuAccordionContext);
}
