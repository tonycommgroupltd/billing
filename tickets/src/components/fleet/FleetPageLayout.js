import React from "react";

/** Wraps fleet pages to contain width and prevent horizontal scroll on mobile. */
const FleetPageLayout = ({ children }) => (
  <div className="fleet-page-root">{children}</div>
);

export default FleetPageLayout;
