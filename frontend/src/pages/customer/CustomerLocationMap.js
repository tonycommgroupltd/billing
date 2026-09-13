import React from 'react';
import { Spinner } from 'reactstrap';
import { Icon } from '../../components/Component';

const CustomerLocationMap = ({ location, loading, phone }) => {
  const { has_location: hasLocation, latitude, longitude, updated_at: updatedAt, tickets_customer_id: ticketsCustomerId } =
    location || {};

  const mapsLink =
    hasLocation && latitude != null && longitude != null
      ? `https://www.google.com/maps?q=${latitude},${longitude}&z=17`
      : null;

  const embedUrl =
    hasLocation && latitude != null && longitude != null
      ? `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`
      : null;

  return (
    <div className="card-block mt-3">
      <div
        className="card-block-header d-flex justify-content-between align-items-center"
        style={{ borderBottom: '1px solid rgba(160, 175, 185, 0.15)' }}
      >
        <div className="d-flex align-items-center gap-2">
          <Icon name="map-pin" />
          <span>Customer location (ticketing system)</span>
        </div>
        {mapsLink && (
          <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary">
            Open in Google Maps
          </a>
        )}
      </div>
      <div className="card-block-body pt-3">
        {loading ? (
          <div className="text-muted small">
            <Spinner size="sm" className="me-2" />
            Loading location from tickets…
          </div>
        ) : hasLocation ? (
          <>
            <div className="small text-muted mb-2">
              Coordinates: <strong>{Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}</strong>
              {ticketsCustomerId ? (
                <span className="ms-2">· Tickets customer #{ticketsCustomerId}</span>
              ) : null}
              {updatedAt ? <span className="ms-2">· Updated {updatedAt}</span> : null}
            </div>
            <div
              className="rounded overflow-hidden border"
              style={{ height: '320px', background: '#f5f6fa' }}
            >
              <iframe
                title="Customer location map"
                src={embedUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </>
        ) : (
          <div className="alert alert-light alert-icon mb-0">
            <em className="icon ni ni-location"></em>
            {phone ? (
              <>
                No GPS location saved in the ticketing system for phone <strong>{phone}</strong>.
                Field technicians capture location when closing installation or support tickets.
              </>
            ) : (
              <>Add a phone number to look up location from the ticketing system.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerLocationMap;
