export const FLEET_MANAGER_ROLES = [
  "super-administrator",
  "super-admin",
  "administrator",
  "manager",
];

export function normalizeUserRoles(user) {
  const roles = [...(user?.all_roles || [])];
  if (user?.role) roles.push(user.role);
  return roles.map((r) => (r || "").toString().toLowerCase()).filter(Boolean);
}

export function canManageFleet(user) {
  return normalizeUserRoles(user).some((r) => FLEET_MANAGER_ROLES.includes(r));
}

/** Drivers and managers can edit vehicles on the fleet dashboard. */
export function canEditFleetVehicles(user) {
  return canManageFleet(user) || isFleetDriver(user);
}

export function isFleetDriver(user) {
  return normalizeUserRoles(user).includes("driver");
}

/** Drivers and managers see all fleet sub-nav links (care, dashboard). */
export function canSeeAllFleetNav(user) {
  return canEditFleetVehicles(user);
}
