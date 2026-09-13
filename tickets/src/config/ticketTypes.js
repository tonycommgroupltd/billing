// Shared ticket types configuration
export const TICKET_TYPES = [
  { value: "1", label: "Site survey" },
  { value: "2", label: "Installation" },
  { value: "18", label: "Installation 2" },
  { value: "3", label: "LOS" },
  { value: "4", label: "PON blinking/bad signal" },
  { value: "5", label: "No LOS no internet" },
  { value: "6", label: "Password change" },
  { value: "7", label: "Slow speeds" },
  { value: "8", label: "Help connect Tv/ Wifi devices" },
  { value: "9", label: "Adss/ Pole/ Enclosure installation" },
  { value: "10", label: "Signal/ Power distribution" },
  { value: "11", label: "Maintenance/ Cable sag/ Cable cut" },
  { value: "12", label: "Faulty Router change" },
  { value: "13", label: "Relocation" },
  { value: "14", label: "Support" },
  { value: "15", label: "Technical" },
  { value: "16", label: "Billing" },
  { value: "17", label: "General inquiry" },
  { value: "19", label: "Extension" }
];

// Convert to simple array for dropdown filtering
export const getTypeLabels = () => TICKET_TYPES.map(type => type.label.toLowerCase());

// Get type label by value
export const getTypeLabelById = (typeId) => {
  const type = TICKET_TYPES.find(t => t.value === typeId);
  return type ? type.label : 'Unknown';
};

// Get type value by label
export const getTypeIdByLabel = (label) => {
  const type = TICKET_TYPES.find(t => t.label.toLowerCase() === label.toLowerCase());
  return type ? type.value : null;
};

export const INSTALLATION_TYPE_ID = "2";
export const INSTALLATION_2_TYPE_ID = "18";

/** First-time installation: unique phone required. */
export const isStrictInstallationType = (typeIdOrLabel) => {
  const s = String(typeIdOrLabel || "").trim().toLowerCase();
  if (s === INSTALLATION_TYPE_ID) return true;
  const t = TICKET_TYPES.find((x) => x.value === s || x.label.toLowerCase() === s);
  return t?.label.toLowerCase() === "installation";
};

/** Installation or Installation 2 (repeat booking allowed for Installation 2). */
export const isInstallationWithPriceType = (typeIdOrLabel) => {
  const s = String(typeIdOrLabel || "").trim().toLowerCase();
  if (s === INSTALLATION_TYPE_ID || s === INSTALLATION_2_TYPE_ID) return true;
  const t = TICKET_TYPES.find((x) => x.value === s || x.label.toLowerCase() === s);
  const label = t?.label.toLowerCase() || s;
  return label === "installation" || label === "installation 2";
};

/** Installations menu, stats, archived list — both Installation types. */
export const isInstallationMenuType = (typeIdOrLabel) => {
  return isInstallationWithPriceType(typeIdOrLabel);
};

/** Types shown on Installation Full Report (includes related field work). */
export const INSTALLATION_REPORT_TYPES = [
  "Installation",
  "Installation 2",
  "Adss/ Pole/ Enclosure installation",
  "Site survey",
  "Relocation",
];