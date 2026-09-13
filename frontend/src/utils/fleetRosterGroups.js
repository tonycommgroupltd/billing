export const FLEET_GROUP_CODES = ["PASSO", "KDN", "KDS", "KDX"];

/** TEAM A/B/C/D in bulletin maps to fleet vehicle when code not spelled out in header. */
export const TEAM_LETTER_FLEET_MAP = {
  A: "PASSO",
  B: "KDN",
  C: "KDX",
  D: "KDS",
};

/**
 * Match a daily roster team header to PASSO / KDN / KDS / KDX.
 * e.g. "TEAM A LOS PASSO", "TEAM D INSTALLATION KDS", or "TEAM B LOS" → KDN
 */
export function detectFleetGroupFromTeamTitle(title) {
  const upper = (title || "").toUpperCase().trim();
  if (!upper) return null;

  for (const code of FLEET_GROUP_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) {
      return code;
    }
  }

  const letterMatch = upper.match(/\bTEAM\s+([A-D])\b/);
  if (letterMatch) {
    return TEAM_LETTER_FLEET_MAP[letterMatch[1]] || null;
  }

  for (const code of FLEET_GROUP_CODES) {
    if (upper.startsWith(code)) {
      return code;
    }
  }

  return null;
}

/** Map saved roster teams → fleet vehicle code (first match wins). */
export function mapRosterTeamsToFleetGroups(teams) {
  const map = {};
  (teams || []).forEach((team) => {
    const code = detectFleetGroupFromTeamTitle(team.team_title);
    if (code && !map[code]) {
      map[code] = normalizeRosterTeam(team);
    }
  });
  return map;
}

export function normalizeRosterTeam(team) {
  if (!team) return null;
  return {
    team_title: team.team_title || "",
    phone: team.phone || "",
    extra_info: team.extra_info || "",
    members: (team.members || []).map((m) => ({
      member_name: m.member_name || m.pasted_label || "",
      pasted_label: m.pasted_label || m.member_name || "",
      user_id: m.user_id ? Number(m.user_id) : null,
    })),
  };
}

/** Always return 4 rows: PASSO, KDN, KDS, KDX with vehicle + roster team. */
export function buildFleetVehicleRows(teams, apiGroups) {
  const liveTeams = mapRosterTeamsToFleetGroups(teams);
  const byCode = {};
  (apiGroups || []).forEach((g) => {
    if (g?.code) byCode[g.code] = g;
  });

  return FLEET_GROUP_CODES.map((code) => {
    const apiGroup = byCode[code] || {};
    return {
      code,
      vehicle: apiGroup.vehicle || null,
      team: liveTeams[code] || normalizeRosterTeam(apiGroup.team) || null,
    };
  });
}

export function formatRosterTeamHeader(team) {
  if (!team?.team_title) return "";
  const parts = [team.team_title];
  if (team.phone) parts.push(team.phone);
  return parts.join(" · ");
}

export function fleetImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const env = typeof process !== "undefined" ? process.env : {};
  const useLocalPhp = env.REACT_APP_PHP_USE_LOCAL === "true";

  if (useLocalPhp) {
    return normalizedPath;
  }

  // Desktop APP.TCOM proxies tickets API at /tickets-api (same host in Electron).
  const ticketsBase = (env.REACT_APP_TICKETS_API_URL || "/tickets-api").replace(/\/$/, "");
  if (ticketsBase.startsWith("/") || ticketsBase.startsWith("http")) {
    return `${ticketsBase}${normalizedPath}`;
  }

  const apiUrl = (env.REACT_APP_API_URL || "https://isp.tonycommgroupltd.com/api/v1").replace(
    /\/$/,
    ""
  );
  return `${apiUrl}${normalizedPath}`;
}

export function readImageFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function formatExpiryLabel(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function fleetInsuranceTypeLabel(type) {
  return type === "private" ? "Private" : "Commercial";
}

export function vehicleRequiresInspection(vehicle) {
  return (vehicle?.insurance_type || "commercial") !== "private";
}

/** Match saved fleet assignment to a technician/engineer option id. */
export function resolveFleetDriverOptionId(assignment, options = []) {
  if (!assignment) return "";
  if (assignment.driver_id) {
    return String(assignment.driver_id);
  }
  const savedName = (assignment.driver_name || "").trim().toLowerCase();
  if (!savedName) return "";
  const match = options.find((o) => (o.name || "").trim().toLowerCase() === savedName);
  return match ? String(match.id) : "";
}

export function fleetDriverDisplayName(option) {
  if (!option) return "";
  return option.name || option.label?.split(" (")[0] || "";
}
