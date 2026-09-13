import CustomersAPI from './CustomersAPI';
import TicketsAPI from './TicketsAPI';
import { getTicketPinLocation } from '../utils/ticketInstallationDetails';

/**
 * Resolve GPS from the ticketing DB (tonycommgroupltd_db) by phone.
 * Falls back to pin stored on an installation ticket description when the
 * tickets customer record has no coordinates yet.
 * Billing customer IDs in APP.TCOM do not match ticketing customer IDs.
 */
export async function fetchTicketCustomerLocation(phone) {
  const normalized = String(phone || '').trim();
  if (!normalized) {
    return {
      has_location: false,
      latitude: null,
      longitude: null,
      tickets_customer_id: null,
      updated_at: null,
    };
  }

  const searchResponse = await CustomersAPI.searchByPhone(normalized);
  const ticketsCustomer = searchResponse?.data;

  if (searchResponse?.found && ticketsCustomer?.id) {
    const locationResponse = await CustomersAPI.getCustomerLocation(ticketsCustomer.id);
    if (locationResponse?.has_location) {
      return {
        has_location: true,
        latitude: locationResponse?.latitude ?? null,
        longitude: locationResponse?.longitude ?? null,
        tickets_customer_id: ticketsCustomer.id,
        customer_name: locationResponse?.customer_name || ticketsCustomer.name,
        updated_at: locationResponse?.updated_at ?? null,
      };
    }
  }

  // Fallback: pin saved on installation ticket details (description line).
  try {
    const ticketsResponse = await TicketsAPI.getAll({
      q: normalized,
      per_page: 20,
    });
    const tickets = ticketsResponse?.data || [];
    for (const ticket of tickets) {
      const pin = getTicketPinLocation(ticket);
      const ticketPhone = String(
        ticket?.customer_phone || ticket?.customerPhone || ticket?.phone || ''
      ).replace(/\D/g, '');
      const needle = normalized.replace(/\D/g, '');
      if (pin && ticketPhone && needle && ticketPhone.slice(-9) === needle.slice(-9)) {
        return {
          has_location: true,
          latitude: pin.latitude,
          longitude: pin.longitude,
          tickets_customer_id: ticketsCustomer?.id || null,
          customer_name: ticketsCustomer?.name || ticket.customer_name,
          updated_at: ticket.updated_at || null,
          source: 'ticket_description',
        };
      }
    }
  } catch (error) {
    console.warn('Ticket pin fallback lookup failed:', error?.message || error);
  }

  return {
    has_location: false,
    latitude: null,
    longitude: null,
    tickets_customer_id: ticketsCustomer?.id || null,
    updated_at: null,
  };
}
