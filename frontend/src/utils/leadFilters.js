import moment from "moment";

export const getLeadOwner = (lead) =>
  lead.createdBy || lead.created_by || lead.owner_name || lead.owner || "Unknown";

export const getLeadActivityTime = (lead) => {
  const raw = lead.ticket_updated_at || lead.updated_at || lead.created_at;
  return raw ? moment(raw) : null;
};

export const getLeadTicketStatus = (lead) =>
  String(lead.ticketStatus || lead.ticket_status || lead.status || "pending").toLowerCase();

export const isLeadConverted = (lead) => {
  if (
    lead.converted_customer_id ||
    lead.convertedCustomerId ||
    lead.customer_id ||
    lead.customerId ||
    lead.converted_at
  ) {
    return true;
  }

  return ["converted", "installed", "installation complete"].includes(getLeadTicketStatus(lead));
};

export const getLeadPipelineStatus = (lead) => {
  if (isLeadConverted(lead)) return "converted";

  const status = getLeadTicketStatus(lead);
  if (["cancelled", "lost"].includes(status)) return "lost";
  if (["work in progress", "assigned", "scheduled", "installation scheduled"].includes(status)) {
    return "in progress";
  }
  if (["resolved", "closed"].includes(status)) return "completed";
  return status === "pending" ? "new" : status;
};

export const LEAD_METRICS = {
  posted: { label: "Total Leads", description: "All installation leads recorded" },
  converted: { label: "Converted", description: "Leads that became customers" },
  pending: { label: "Open Leads", description: "Leads still in the installation pipeline" },
  lost: { label: "Lost / Cancelled", description: "Leads that did not convert" },
};

export const filterLeads = (leads, filters) =>
  leads.filter((lead) => {
    const pipeline = getLeadPipelineStatus(lead);
    if (filters.status !== "all" && pipeline !== filters.status) return false;

    if (filters.owner && getLeadOwner(lead) !== filters.owner) return false;

    const query = String(filters.search || "").trim().toLowerCase();
    if (query) {
      const haystack = [
        lead.name,
        lead.phone,
        lead.email,
        lead.address,
        getLeadOwner(lead),
        lead.ticketNumber,
        lead.ticketId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    const activity = getLeadActivityTime(lead);
    if (filters.start && (!activity || activity.isBefore(moment(filters.start), "day"))) return false;
    if (filters.end && (!activity || activity.isAfter(moment(filters.end), "day"))) return false;
    return true;
  });
