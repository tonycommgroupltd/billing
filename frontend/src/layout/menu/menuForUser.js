import menu from "./MenuData";
import menuAdmin from "./MenuAdminData";
import menuCust from "./MenuCustData";
import menuTechnician from "./MenuTechnicianData";
import menuDriver from "./MenuDriverData";

export function filterMenuByRole(menus, userRoles = []) {
  return menus
    .filter((item) => {
      if (!item.roles) return true;
      return item.roles.some((role) => userRoles.includes(role));
    })
    .map((item) => {
      if (item.subMenu) {
        return {
          ...item,
          subMenu: filterMenuByRole(item.subMenu, userRoles),
        };
      }
      return item;
    })
    .filter((item) => {
      if (item.subMenu) return item.subMenu.length > 0;
      return true;
    });
}

export function getMenuForUser(allRoles = []) {
  let selectedMenu = menuCust;

  // ICT gets the full Super Admin menu (same product reach).
  if (allRoles.includes("super-administrator") || allRoles.includes("ict")) {
    selectedMenu = menu;
  } else if (
    allRoles.includes("driver") &&
    !["administrator", "manager", "super-administrator", "ict", "technician", "engineer"].some(
      (role) => allRoles.includes(role)
    )
  ) {
    selectedMenu = menuDriver;
  } else if (
    ["technician", "engineer", "customer-creator"].some((role) => allRoles.includes(role)) &&
    !["administrator", "manager", "super-administrator", "ict"].some((role) => allRoles.includes(role))
  ) {
    selectedMenu = menuTechnician;
  } else if (
    ["administrator", "financial-manager", "manager", "customer-care"].some((role) =>
      allRoles.includes(role)
    )
  ) {
    selectedMenu = menuAdmin;
  }

  return filterMenuByRole(selectedMenu, allRoles);
}
