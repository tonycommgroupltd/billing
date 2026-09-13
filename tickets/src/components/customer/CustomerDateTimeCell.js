import React from "react";
import { formatTicketDateVeryShort, getTimeAgo } from "../../utils/dateUtils";

/**
 * Table cell for customer created/updated timestamps (same style as tickets list).
 */
const CustomerDateTimeCell = ({ value, showRelative = true }) => {
  if (!value) {
    return <span className="text-muted">—</span>;
  }

  return (
    <div style={{ lineHeight: 1.35 }}>
      <div style={{ whiteSpace: "nowrap", fontSize: "13px" }}>
        {formatTicketDateVeryShort(value)}
      </div>
      {showRelative && (
        <div style={{ fontSize: "11px", color: "#8094ae" }}>{getTimeAgo(value)}</div>
      )}
    </div>
  );
};

export const customerDateTimeSelector = (row, field) =>
  row[field] ? formatTicketDateVeryShort(row[field]) : "—";

export default CustomerDateTimeCell;
