import React from "react";
import { Badge } from "reactstrap";

export const statusColor = (status) => {
  if (status === "synced") return "success";
  if (status === "failed") return "danger";
  return "warning";
};

export const CommandBlock = ({ text }) => (
  <pre
    className="bg-lighter p-3 rounded"
    style={{ fontSize: "12px", whiteSpace: "pre-wrap", marginBottom: 0 }}
  >
    {text}
  </pre>
);

export const PeerBadges = ({ peer }) => (
  <span className="d-inline-flex flex-wrap align-items-center" style={{ gap: "4px" }}>
    <Badge color={statusColor(peer.sync_status)}>{peer.sync_status || "pending"}</Badge>
    {peer.last_test_ok === true ? <Badge color="success">Reachable</Badge> : null}
    {peer.last_test_ok === false ? <Badge color="danger">Unreachable</Badge> : null}
  </span>
);
