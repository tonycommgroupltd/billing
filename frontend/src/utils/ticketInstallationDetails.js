const PACKAGE_LINE_PATTERN = /^[ \t]*Package[ \t]*:[ \t]*(.*)[ \t]*$/im;
const CONFIGURED_LINE_PATTERN = /^[ \t]*Configured[ \t]*:[ \t]*(.*)[ \t]*$/im;
const UNCONFIGURED_REVOKED_LINE_PATTERN =
  /^[ \t]*Unconfigured revoked[ \t]*:[ \t]*(.*)[ \t]*$/im;
const PIN_LOCATION_LINE_PATTERN =
  /^[ \t]*Pin location[ \t]*:[ \t]*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)[ \t]*$/im;

export const UNCONFIGURED_TICKET_TYPES = new Set([
  'installation',
  'installation 2',
  'installation2',
  'installation_2',
  'relocation',
]);

export const getTicketTypeLabel = (ticket) =>
  (ticket?.typeLabel || ticket?.type || ticket?.ticket_type || ticket?.ticketType || '')
    .toString()
    .trim();

export const getTicketTypeKey = (ticket) => getTicketTypeLabel(ticket).toLowerCase();

export const isUnconfiguredTicketType = (ticket) =>
  UNCONFIGURED_TICKET_TYPES.has(getTicketTypeKey(ticket));

export const getTicketCustomerName = (ticket) =>
  (
    ticket?.customer?.name ||
    ticket?.customer_name ||
    ticket?.customerName ||
    ''
  )
    .toString()
    .trim();

export const getTicketCustomerPhone = (ticket) =>
  (
    ticket?.customer?.phone ||
    ticket?.customer_phone ||
    ticket?.customerPhone ||
    ticket?.phone ||
    ''
  )
    .toString()
    .trim();

export const getTicketCustomerAddress = (ticket) =>
  (
    ticket?.customer?.address ||
    ticket?.customer_address ||
    ticket?.address ||
    ''
  )
    .toString()
    .trim();

export const getTicketPackage = (ticket) => {
  const descriptionMatch = String(ticket?.description || '').match(PACKAGE_LINE_PATTERN);
  return (
    descriptionMatch?.[1] ||
    ticket?.package ||
    ticket?.customer_package ||
    ticket?.package_name ||
    ''
  )
    .toString()
    .trim();
};

const toFiniteCoord = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** GPS pin from ticket description or explicit lat/lng fields. */
export const getTicketPinLocation = (ticket) => {
  const latitude = toFiniteCoord(
    ticket?.latitude ?? ticket?.lat ?? ticket?.customer?.latitude ?? ticket?.pin_latitude
  );
  const longitude = toFiniteCoord(
    ticket?.longitude ?? ticket?.lng ?? ticket?.customer?.longitude ?? ticket?.pin_longitude
  );
  if (latitude != null && longitude != null && latitude !== 0 && longitude !== 0) {
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude };
    }
  }

  const match = String(ticket?.description || '').match(PIN_LOCATION_LINE_PATTERN);
  if (!match) return null;
  const fromDescription = {
    latitude: toFiniteCoord(match[1]),
    longitude: toFiniteCoord(match[2]),
  };
  if (
    fromDescription.latitude == null ||
    fromDescription.longitude == null ||
    fromDescription.latitude === 0 ||
    fromDescription.longitude === 0
  ) {
    return null;
  }
  return fromDescription;
};

export const formatPinLocationLine = (latitude, longitude) =>
  `Pin location: ${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;

export const upsertPinLocationLine = (description, latitude, longitude) => {
  const currentDescription = String(description || '');
  const pinLine = formatPinLocationLine(latitude, longitude);

  if (PIN_LOCATION_LINE_PATTERN.test(currentDescription)) {
    return currentDescription.replace(PIN_LOCATION_LINE_PATTERN, pinLine);
  }

  if (!currentDescription) return pinLine;
  return `${currentDescription}${/\r?\n$/.test(currentDescription) ? '' : '\n'}${pinLine}`;
};

export const isTicketConfigured = (ticket) =>
  CONFIGURED_LINE_PATTERN.test(String(ticket?.description || ''));

/** Soft-hidden from Unconfigured UI; ticket + customer details stay in the tickets DB. */
export const isUnconfiguredRevoked = (ticket) =>
  UNCONFIGURED_REVOKED_LINE_PATTERN.test(String(ticket?.description || ''));

export const upsertUnconfiguredRevokedLine = (description, details) => {
  const currentDescription = String(description || '');
  const revokedLine = `Unconfigured revoked: ${details}`;

  if (UNCONFIGURED_REVOKED_LINE_PATTERN.test(currentDescription)) {
    return currentDescription.replace(UNCONFIGURED_REVOKED_LINE_PATTERN, revokedLine);
  }

  if (!currentDescription) return revokedLine;
  return `${currentDescription}${/\r?\n$/.test(currentDescription) ? '' : '\n'}${revokedLine}`;
};

export const hasInstallationCustomerDetails = (ticket) =>
  Boolean(
    getTicketCustomerName(ticket) &&
      getTicketCustomerPhone(ticket) &&
      getTicketCustomerAddress(ticket) &&
      getTicketPackage(ticket) &&
      getTicketPinLocation(ticket)
  );

export const isEligibleUnconfiguredTicket = (ticket) =>
  isUnconfiguredTicketType(ticket) &&
  hasInstallationCustomerDetails(ticket) &&
  !isTicketConfigured(ticket) &&
  !isUnconfiguredRevoked(ticket);

export const upsertPackageLine = (description, packageName) => {
  const currentDescription = String(description || '');
  const packageLine = `Package: ${packageName}`;

  if (PACKAGE_LINE_PATTERN.test(currentDescription)) {
    return currentDescription.replace(PACKAGE_LINE_PATTERN, packageLine);
  }

  if (!currentDescription) return packageLine;
  return `${currentDescription}${/\r?\n$/.test(currentDescription) ? '' : '\n'}${packageLine}`;
};

export const upsertConfiguredLine = (description, details) => {
  const currentDescription = String(description || '');
  const configuredLine = `Configured: ${details}`;

  if (CONFIGURED_LINE_PATTERN.test(currentDescription)) {
    return currentDescription.replace(CONFIGURED_LINE_PATTERN, configuredLine);
  }

  if (!currentDescription) return configuredLine;
  return `${currentDescription}${/\r?\n$/.test(currentDescription) ? '' : '\n'}${configuredLine}`;
};

export const normalizePlanKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
