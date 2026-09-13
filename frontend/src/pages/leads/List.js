import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
import { Card, Modal, ModalBody, ModalHeader } from "reactstrap";

import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import LeadsAPI from "../../helpers/LeadsAPI";
import TicketsAPI from "../../helpers/TicketsAPI";
import { formatTicketDateVeryShort, getTimeAgo } from "../../utils/dateUtils";
import {
  filterLeads,
  getLeadOwner,
  getLeadPipelineStatus,
  isLeadConverted,
} from "../../utils/leadFilters";
import { showError, showSuccess } from "../../utils/notifications";

const userLabel = (user) =>
  user?.display_name || user?.name || user?.username || user?.email || "Unknown";

const canSeeAllLeads = (user) =>
  (user?.all_roles || []).some((role) =>
    ["super-administrator", "administrator", "manager", "customer-care"].includes(String(role).toLowerCase())
  );

const metricStatus = (metric) => {
  if (metric === "converted") return "converted";
  if (metric === "open") return "open";
  if (metric === "lost") return "lost";
  return "all";
};

const LeadsList = ({ user }) => {
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ status: "", notes: "" });
  const [filters, setFilters] = useState({
    search: "",
    status: metricStatus(searchParams.get("metric")),
    owner: "",
    start: searchParams.get("start") || "",
    end: searchParams.get("end") || "",
  });
  const allLeads = canSeeAllLeads(user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = allLeads
        ? await LeadsAPI.list({ per_page: 10000 })
        : await LeadsAPI.listByUser(userLabel(user), { per_page: 10000 });
      setLeads(response?.data || []);
    } catch (error) {
      console.error("Could not load leads", error);
      showError("Could not load leads.");
    } finally {
      setLoading(false);
    }
  }, [allLeads, user]);

  useEffect(() => {
    load();
  }, [load]);

  const owners = useMemo(
    () => [...new Set(leads.map(getLeadOwner).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [leads]
  );

  const displayedLeads = useMemo(() => {
    if (filters.status === "open") {
      return filterLeads(leads, { ...filters, status: "all" }).filter(
        (lead) => !isLeadConverted(lead) && getLeadPipelineStatus(lead) !== "lost"
      );
    }
    return filterLeads(leads, filters);
  }, [filters, leads]);

  const startEdit = (lead) => {
    setEditLead(lead);
    setEditForm({
      status: getLeadPipelineStatus(lead),
      notes: lead.notes || "",
    });
  };

  const saveLead = async () => {
    if (!editLead) return;
    setSaving(true);
    try {
      const ticketId = editLead.ticketId || editLead.ticket_id;
      const ticketStatus =
        editForm.status === "converted"
          ? "installation complete"
          : editForm.status === "in progress"
            ? "work in progress"
            : editForm.status === "lost"
              ? "cancelled"
              : editForm.status;

      await LeadsAPI.update(editLead.id, {
        status: editForm.status,
        notes: editForm.notes,
      });
      if (ticketId) {
        await TicketsAPI.update(ticketId, { status: ticketStatus });
      }
      showSuccess("Lead status updated.");
      setEditLead(null);
      await load();
    } catch (error) {
      console.error("Lead update failed", error);
      showError(error.response?.data?.error || "Could not update the lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head title="Leads" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <BlockTitle page tag="h3">{allLeads ? "All Leads" : "My Leads"}</BlockTitle>
                <p className="text-muted mb-0">See who brought each customer and whether the installation converted.</p>
              </div>
              <div className="d-flex gap-2">
                <Button color="light" className="btn-icon" onClick={load} disabled={loading}>
                  <Icon name={loading ? "loader" : "reload"} className={loading ? "spinning" : ""} />
                </Button>
                <Link to="/admin/leads/add" className="btn btn-primary">
                  <Icon name="plus" className="me-1" /> Add Lead
                </Link>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Card>
            <div className="card-body">
              <div className="row g-2 mb-3">
                <div className="col-lg-3">
                  <label className="form-label">Search</label>
                  <input
                    className="form-control"
                    placeholder="Name, phone, ticket or agent"
                    value={filters.search}
                    onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                  />
                </div>
                <div className="col-lg-2">
                  <label className="form-label">Status</label>
                  <select
                    className="form-control"
                    value={filters.status}
                    onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
                  >
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="new">New</option>
                    <option value="in progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost / Cancelled</option>
                  </select>
                </div>
                {allLeads && (
                  <div className="col-lg-3">
                    <label className="form-label">Brought by</label>
                    <select
                      className="form-control"
                      value={filters.owner}
                      onChange={(e) => setFilters((current) => ({ ...current, owner: e.target.value }))}
                    >
                      <option value="">All agents</option>
                      {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-lg-2">
                  <label className="form-label">From</label>
                  <input type="date" className="form-control" value={filters.start} onChange={(e) => setFilters((current) => ({ ...current, start: e.target.value }))} />
                </div>
                <div className="col-lg-2">
                  <label className="form-label">To</label>
                  <input type="date" className="form-control" value={filters.end} onChange={(e) => setFilters((current) => ({ ...current, end: e.target.value }))} />
                </div>
              </div>

              <div className="d-flex justify-content-between mb-2">
                <span className="text-muted">Showing {displayedLeads.length} of {leads.length}</span>
                <strong>
                  Converted: {leads.filter(isLeadConverted).length}/{leads.length}
                </strong>
              </div>

              <div className="table-responsive">
                <table className="table table-striped align-middle">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Phone</th>
                      <th>Brought by</th>
                      <th>Ticket</th>
                      <th>Pipeline status</th>
                      <th>Converted?</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan="8" className="text-center text-muted py-4">Loading leads...</td></tr>
                    ) : displayedLeads.length === 0 ? (
                      <tr><td colSpan="8" className="text-center text-muted py-4">No leads match these filters.</td></tr>
                    ) : displayedLeads.map((lead) => {
                      const ticketId = lead.ticketId || lead.ticket_id;
                      const converted = isLeadConverted(lead);
                      return (
                        <tr key={lead.id}>
                          <td>
                            <strong>{lead.name}</strong>
                            {lead.address && <div className="small text-muted">{lead.address}</div>}
                          </td>
                          <td>{lead.phone || "—"}</td>
                          <td><span className="badge bg-outline-primary">{getLeadOwner(lead)}</span></td>
                          <td>
                            {ticketId ? (
                              <Link to={`/admin/tickets/view/${ticketId}`}>#{lead.ticketNumber || ticketId}</Link>
                            ) : "—"}
                          </td>
                          <td><span className="badge bg-secondary text-capitalize">{getLeadPipelineStatus(lead)}</span></td>
                          <td>
                            <span className={`badge ${converted ? "bg-success" : "bg-warning"}`}>
                              {converted ? "Yes" : "No"}
                            </span>
                          </td>
                          <td>
                            {lead.created_at ? (
                              <>
                                <div>{formatTicketDateVeryShort(lead.created_at)}</div>
                                <small className="text-muted">{getTimeAgo(lead.created_at)}</small>
                              </>
                            ) : "—"}
                          </td>
                          <td>
                            <div className="d-flex gap-1">
                              {ticketId && (
                                <Link className="btn btn-sm btn-outline-info" to={`/admin/tickets/view/${ticketId}`}>
                                  <Icon name="eye" />
                                </Link>
                              )}
                              <Button size="sm" color="primary" outline onClick={() => startEdit(lead)}>
                                <Icon name="edit" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </Block>
      </Content>

      <Modal isOpen={Boolean(editLead)} toggle={() => setEditLead(null)}>
        <ModalHeader toggle={() => setEditLead(null)}>Update Lead — {editLead?.name}</ModalHeader>
        <ModalBody>
          <label className="form-label">Pipeline status</label>
          <select className="form-control mb-3" value={editForm.status} onChange={(e) => setEditForm((current) => ({ ...current, status: e.target.value }))}>
            <option value="new">New</option>
            <option value="in progress">In progress</option>
            <option value="completed">Installation completed</option>
            <option value="converted">Converted to customer</option>
            <option value="lost">Lost / Cancelled</option>
          </select>
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows="4" value={editForm.notes} onChange={(e) => setEditForm((current) => ({ ...current, notes: e.target.value }))} />
          <div className="d-flex justify-content-end gap-2 mt-3">
            <Button color="light" onClick={() => setEditLead(null)}>Cancel</Button>
            <Button color="primary" onClick={saveLead} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(LeadsList);
