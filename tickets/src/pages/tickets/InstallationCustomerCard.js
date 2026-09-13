import React, { useEffect, useRef, useState } from 'react';
import TicketsAPI from '../../helpers/TicketsAPI';
import CustomersAPI from '../../helpers/CustomersAPI';
import { normalizeKenyanPhone } from '../../utils/phone';
import { showError, showSuccess } from '../../utils/notifications';
import {
  getTicketCustomerAddress,
  getTicketCustomerName,
  getTicketCustomerPhone,
  getTicketPackage,
  getTicketPinLocation,
  getTicketTypeKey,
  UNCONFIGURED_TICKET_TYPES,
  upsertPackageLine,
  upsertPinLocationLine,
} from '../../utils/ticketInstallationDetails';

const fieldStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  color: '#1f2937',
  background: '#fff',
  fontSize: 14,
};

const resolveTicketsCustomerId = async (ticket, phone) => {
  const existing =
    ticket?.customer_id ||
    ticket?.customerId ||
    (typeof ticket?.customer === 'object' ? ticket.customer?.id : null);
  if (existing) return existing;

  if (!phone) return null;
  try {
    const search = await CustomersAPI.searchByPhone(phone);
    if ((search?.status === 'success' || search?.success || search?.found) && search?.data?.id) {
      return search.data.id;
    }
  } catch (error) {
    console.warn('Tickets customer lookup for pin failed:', error?.message || error);
  }
  return null;
};

const InstallationCustomerCard = ({ ticket, onSaved, initialLocation }) => {
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    address: '',
    packageName: '',
  });
  const [pin, setPin] = useState({ latitude: null, longitude: null, accuracy: null });
  const [saving, setSaving] = useState(false);
  const [capturingPin, setCapturingPin] = useState(false);
  const seededPinRef = useRef(null);

  const syncCustomerLocation = async (latitude, longitude, phoneOverride = null) => {
    const phone = phoneOverride || normalizeKenyanPhone(form.customerPhone || getTicketCustomerPhone(ticket));
    const ticketsCustomerId = await resolveTicketsCustomerId(ticket, phone);
    if (!ticketsCustomerId) return;
    try {
      await CustomersAPI.updateCustomerLocation(ticketsCustomerId, { latitude, longitude });
    } catch (locationError) {
      console.warn('Failed to sync pin to tickets customer:', locationError);
    }
  };

  /** Persist pin into ticket description so Authorize / Unconfigured eligibility works without a full Save. */
  const persistPin = async (latitude, longitude, accuracy = null, { quiet = false } = {}) => {
    if (!ticket?.id) return false;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;

    const description = upsertPinLocationLine(ticket?.description, latitude, longitude);
    try {
      const response = await TicketsAPI.update(ticket.id, { description });
      if (!response || response.success === false || response.status === 'error') {
        throw new Error(response?.message || response?.error || 'Failed to save pin');
      }

      await syncCustomerLocation(latitude, longitude);

      const updates = {
        description,
        latitude,
        longitude,
        customer: {
          ...(typeof ticket?.customer === 'object' ? ticket.customer : {}),
          latitude,
          longitude,
        },
      };
      onSaved?.(updates);
      if (!quiet) {
        showSuccess(
          `Pin saved${accuracy != null ? ` (±${Math.round(accuracy)}m)` : ''}. Save the rest of the details when ready.`
        );
      }
      return true;
    } catch (error) {
      if (!quiet) {
        showError(error?.response?.data?.message || error?.message || 'Failed to save pin location.');
      }
      return false;
    }
  };

  useEffect(() => {
    setForm({
      customerName: getTicketCustomerName(ticket),
      customerPhone: getTicketCustomerPhone(ticket),
      address: getTicketCustomerAddress(ticket),
      packageName: getTicketPackage(ticket),
    });

    const fromTicket = getTicketPinLocation(ticket);
    if (fromTicket) {
      setPin({
        latitude: fromTicket.latitude,
        longitude: fromTicket.longitude,
        accuracy: null,
      });
      return;
    }

    if (initialLocation?.hasLocation && initialLocation.latitude != null && initialLocation.longitude != null) {
      const latitude = Number(initialLocation.latitude);
      const longitude = Number(initialLocation.longitude);
      setPin({ latitude, longitude, accuracy: null });

      const seedKey = `${ticket?.id}:${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      if (ticket?.id && seededPinRef.current !== seedKey) {
        seededPinRef.current = seedKey;
        persistPin(latitude, longitude, null, { quiet: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when map pin appears
  }, [ticket, initialLocation]);

  if (!UNCONFIGURED_TICKET_TYPES.has(getTicketTypeKey(ticket))) return null;

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleCapturePin = () => {
    if (!navigator.geolocation) {
      return showError('Geolocation is not supported by this browser.');
    }

    setCapturingPin(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        setPin({ latitude, longitude, accuracy });
        setCapturingPin(false);
        await persistPin(latitude, longitude, accuracy);
      },
      (error) => {
        setCapturingPin(false);
        let message = 'Failed to capture pin location.';
        if (error?.code === 1) message = 'Location access denied. Allow location in the browser, then try again.';
        if (error?.code === 2) message = 'Location unavailable. Move outdoors or try again.';
        if (error?.code === 3) message = 'Location request timed out. Try again.';
        showError(message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleOpenMap = () => {
    if (pin.latitude == null || pin.longitude == null) {
      return showError('Capture a pin location first.');
    }
    window.open(
      `https://www.google.com/maps?q=${pin.latitude},${pin.longitude}&z=17`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const customerName = form.customerName.trim();
    const customerPhone = normalizeKenyanPhone(form.customerPhone);
    const address = form.address.trim();
    const packageName = form.packageName.trim();
    const latitude = Number(pin.latitude);
    const longitude = Number(pin.longitude);

    if (!customerName) return showError('Customer name is required.');
    if (!/^0[17]\d{8}$/.test(customerPhone)) {
      return showError('Enter a valid Kenyan phone number.');
    }
    if (!address) return showError('Customer address is required.');
    if (!packageName) return showError('Customer package is required.');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return showError('Pin location is required. Capture the installation pin first.');
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return showError('Pin coordinates are invalid.');
    }

    let description = upsertPackageLine(ticket?.description, packageName);
    description = upsertPinLocationLine(description, latitude, longitude);

    try {
      setSaving(true);
      const response = await TicketsAPI.update(ticket.id, {
        customerName,
        customerPhone,
        address,
        description,
      });

      if (!response || response.success === false || response.status === 'error') {
        throw new Error(response?.message || response?.error || 'Failed to save customer details');
      }

      await syncCustomerLocation(latitude, longitude, customerPhone);

      const updates = {
        customerName,
        customer_name: customerName,
        customerPhone,
        customer_phone: customerPhone,
        phone: customerPhone,
        address,
        customer_address: address,
        description,
        package: packageName,
        customer_package: packageName,
        package_name: packageName,
        latitude,
        longitude,
        customer: {
          ...(typeof ticket?.customer === 'object' ? ticket.customer : {}),
          name: customerName,
          phone: customerPhone,
          address,
          latitude,
          longitude,
        },
      };

      setForm({ customerName, customerPhone, address, packageName });
      onSaved?.(updates);
      showSuccess('Installation customer details (including pin) saved successfully.');
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || 'Failed to save customer details.');
    } finally {
      setSaving(false);
    }
  };

  const hasPin = Number.isFinite(Number(pin.latitude)) && Number.isFinite(Number(pin.longitude));

  return (
    <section
      style={{
        background: '#eff6ff',
        border: '1px solid #93c5fd',
        borderLeft: '5px solid #2563eb',
        borderRadius: 8,
        padding: '18px 20px',
        marginBottom: 16,
        boxShadow: '0 3px 10px rgba(37, 99, 235, 0.10)',
      }}
      aria-labelledby="installation-customer-heading"
    >
      <div style={{ marginBottom: 14 }}>
        <h5 id="installation-customer-heading" style={{ margin: 0, color: '#1e3a8a', fontSize: 17 }}>
          Installation customer details
        </h5>
        <div style={{ marginTop: 3, color: '#475569', fontSize: 13 }}>
          Confirm the customer, package, and installation pin before adding the customer.
          Capturing a pin saves it immediately.
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <label style={{ color: '#334155', fontSize: 13, fontWeight: 600 }}>
            Customer name *
            <input
              type="text"
              value={form.customerName}
              onChange={handleChange('customerName')}
              style={{ ...fieldStyle, marginTop: 5 }}
              required
            />
          </label>
          <label style={{ color: '#334155', fontSize: 13, fontWeight: 600 }}>
            Phone *
            <input
              type="tel"
              value={form.customerPhone}
              onChange={handleChange('customerPhone')}
              onBlur={() => setForm((current) => ({
                ...current,
                customerPhone: normalizeKenyanPhone(current.customerPhone),
              }))}
              placeholder="0712345678"
              style={{ ...fieldStyle, marginTop: 5 }}
              required
            />
          </label>
          <label style={{ color: '#334155', fontSize: 13, fontWeight: 600 }}>
            Address *
            <input
              type="text"
              value={form.address}
              onChange={handleChange('address')}
              style={{ ...fieldStyle, marginTop: 5 }}
              required
            />
          </label>
          <label style={{ color: '#334155', fontSize: 13, fontWeight: 600 }}>
            Package *
            <input
              type="text"
              value={form.packageName}
              onChange={handleChange('packageName')}
              placeholder="e.g. 5Mbps"
              style={{ ...fieldStyle, marginTop: 5 }}
              required
            />
          </label>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 8,
            border: `1px solid ${hasPin ? '#93c5fd' : '#fcd34d'}`,
            background: hasPin ? '#f8fbff' : '#fffbeb',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#1e3a8a', fontSize: 13, fontWeight: 700 }}>Pin location *</div>
              <div style={{ color: '#475569', fontSize: 13, marginTop: 3 }}>
                {hasPin
                  ? `${Number(pin.latitude).toFixed(6)}, ${Number(pin.longitude).toFixed(6)}${
                      pin.accuracy != null ? ` (±${Math.round(pin.accuracy)}m)` : ''
                    }`
                  : 'Not set — capture the site pin so it is part of customer details.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleCapturePin}
                disabled={capturingPin || saving}
                style={{
                  border: '1px solid #2563eb',
                  borderRadius: 6,
                  padding: '8px 14px',
                  background: '#fff',
                  color: '#2563eb',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: capturingPin || saving ? 'not-allowed' : 'pointer',
                  opacity: capturingPin || saving ? 0.65 : 1,
                }}
              >
                {capturingPin ? 'Capturing…' : hasPin ? 'Recapture pin' : 'Capture pin'}
              </button>
              <button
                type="button"
                onClick={handleOpenMap}
                disabled={!hasPin}
                style={{
                  border: '1px solid #0284c7',
                  borderRadius: 6,
                  padding: '8px 14px',
                  background: '#fff',
                  color: '#0284c7',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: hasPin ? 'pointer' : 'not-allowed',
                  opacity: hasPin ? 1 : 0.5,
                }}
              >
                View on map
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              border: 0,
              borderRadius: 6,
              padding: '9px 22px',
              background: '#2563eb',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.65 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default InstallationCustomerCard;
