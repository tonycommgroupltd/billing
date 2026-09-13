import CustomerCreaterAPI from "./CustomerCreaterAPI";

/**
 * Leads use the existing customer_creators service so historical prospects and
 * installation bookings remain visible while the UI uses CRM terminology.
 */
const LeadsAPI = CustomerCreaterAPI;

export default LeadsAPI;
