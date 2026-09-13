import React, { useState } from "react";
import { connect } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Card } from "reactstrap";

import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import LeadsAPI from "../../helpers/LeadsAPI";
import CustomersAPI from "../../helpers/CustomersAPI";
import TicketsAPI from "../../helpers/TicketsAPI";
import { showError, showSuccess } from "../../utils/notifications";
import { normalizeKenyanPhone, kenyanPhonesMatch } from "../../utils/phone";
import { subjectWithInstallationPrice } from "../../utils/installationTicket";
import {
  INSTALLATION_TYPE_ID,
  INSTALLATION_2_TYPE_ID,
  getTypeLabelById,
  isStrictInstallationType,
} from "../../config/ticketTypes";
import { useActivityLogger, ACTIVITY_TYPES, TARGET_TYPES } from "../../hooks/useActivityLogger";

const LEAD_TICKET_TYPES = [
  { value: INSTALLATION_TYPE_ID, label: "Installation" },
  { value: INSTALLATION_2_TYPE_ID, label: "Installation 2" },
];

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  installation_price: "",
};

const userLabel = (user) =>
  user?.display_name || user?.name || user?.username || user?.email || "Unknown";

const fileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const AddLead = ({ user }) => {
  const navigate = useNavigate();
  const logActivity = useActivityLogger();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [ticketTypeId, setTicketTypeId] = useState(INSTALLATION_TYPE_ID);
  const [ticketSubject, setTicketSubject] = useState("");
  const [files, setFiles] = useState([]);

  const typeLabel = getTypeLabelById(ticketTypeId);
  const strictPhone = isStrictInstallationType(ticketTypeId);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const next =
      name === "phone"
        ? value.replace(/\s/g, "")
        : name === "installation_price"
          ? value.replace(/[^\d.]/g, "")
          : value;
    setForm((current) => ({ ...current, [name]: next }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const phone = normalizeKenyanPhone(form.phone);
    const price = Number(form.installation_price);
    if (!form.name.trim() || !/^0[17]\d{8}$/.test(phone)) {
      showError("Enter the lead's name and a valid Kenyan phone number.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showError("Enter a valid installation price.");
      return;
    }

    setLoading(true);
    try {
      if (strictPhone) {
        try {
          const existingCustomer = await CustomersAPI.searchByPhone(phone);
          if (existingCustomer?.success && (existingCustomer?.found || existingCustomer?.customer || existingCustomer?.data)) {
            showError(`${phone} is already registered as a customer. Use Installation 2 for repeat work.`);
            return;
          }
        } catch (error) {
          if (error.response?.status !== 404) console.warn("Customer duplicate check failed", error);
        }

        const existingLeads = await LeadsAPI.list({ search: phone, per_page: 20 });
        const duplicate = (existingLeads?.data || []).find((lead) => kenyanPhonesMatch(lead.phone, phone));
        if (duplicate) {
          showError(`${phone} is already recorded as lead #${duplicate.id}.`);
          return;
        }
      }

      const broughtBy = userLabel(user);
      const baseSubject =
        ticketSubject.trim() || `${typeLabel} - ${form.name.trim()} - ${phone} - ${form.address || "Address TBD"}`;
      const ticketResponse = await TicketsAPI.create({
        subject: subjectWithInstallationPrice(baseSubject, price),
        description:
          `New lead installation booking for ${form.name.trim()}\n\n` +
          `Phone: ${phone}\nInstallation price: KES ${price.toLocaleString("en-KE")}\n` +
          `Email: ${form.email || "Not provided"}\nAddress: ${form.address || "Address TBD"}\n\n` +
          `Brought by: ${broughtBy}\nNotes: ${form.notes || "None"}`,
        status: "new",
        priority: "medium",
        type: typeLabel,
        installation_price: price,
        customerName: form.name.trim(),
        customerPhone: phone,
        customerEmail: form.email,
        address: form.address,
        createdBy: broughtBy,
        assignedTo: "",
      });

      const ticket = ticketResponse?.data;
      if (!ticket?.id) throw new Error("The installation ticket was not created.");

      const attachments = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          base64: await fileAsBase64(file),
        }))
      );

      const leadResponse = await LeadsAPI.create({
        ...form,
        name: form.name.trim(),
        phone,
        installation_price: price,
        status: "pending",
        ticket_id: ticket.id,
        ticket_type: typeLabel,
        createdBy: broughtBy,
        created_by: broughtBy,
        notes: `${typeLabel} ticket #${ticket.id} created. ${form.notes || ""}`.trim(),
        attachments,
      });

      await logActivity(
        ACTIVITY_TYPES.CUSTOMER_CREATED,
        `Recorded lead ${form.name.trim()} (${phone}), brought by ${broughtBy}, ticket #${ticket.id}`,
        TARGET_TYPES.CUSTOMER,
        leadResponse?.data?.id || null
      );

      showSuccess(`Lead recorded and installation ticket #${ticket.id} booked.`);
      setForm(initialForm);
      setFiles([]);
      setTicketSubject("");
      navigate("/admin/leads/list");
    } catch (error) {
      console.error("Lead creation failed", error);
      showError(error.response?.data?.error || error.message || "Could not record the lead.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head title="Add Lead" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">Add Lead & Book Installation</BlockTitle>
            <p className="text-muted mb-0">The logged-in user is permanently recorded as who brought the customer.</p>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          <Card>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Customer name *</label>
                    <input className="form-control" name="name" value={form.name} onChange={handleChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Phone *</label>
                    <input
                      className="form-control"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange}
                      onBlur={() => setForm((current) => ({ ...current, phone: normalizeKenyanPhone(current.phone) }))}
                      placeholder="0712345678"
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input className="form-control" name="email" type="email" value={form.email} onChange={handleChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Address</label>
                    <input className="form-control" name="address" value={form.address} onChange={handleChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Installation type *</label>
                    <select className="form-control" value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)}>
                      {LEAD_TICKET_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <small className="text-muted">
                      {strictPhone ? "First installation requires a new phone." : "Repeat installation bookings are allowed."}
                    </small>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Installation price (KES) *</label>
                    <input
                      className="form-control"
                      name="installation_price"
                      inputMode="decimal"
                      value={form.installation_price}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Ticket subject</label>
                    <input
                      className="form-control"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="Leave blank to generate automatically"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Notes</label>
                    <textarea className="form-control" name="notes" rows="3" value={form.notes} onChange={handleChange} />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Attachments</label>
                    <input
                      className="form-control"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      onChange={(e) => {
                        setFiles((current) => [...current, ...Array.from(e.target.files)]);
                        e.target.value = "";
                      }}
                    />
                    {files.map((file, index) => (
                      <div className="d-flex justify-content-between align-items-center border rounded p-2 mt-2" key={`${file.name}-${index}`}>
                        <span><Icon name="file" className="me-1" /> {file.name}</span>
                        <Button type="button" size="sm" color="danger" outline onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <Button type="submit" color="primary" disabled={loading}>
                    <Icon name={loading ? "loader" : "user-add"} className={loading ? "spinning me-1" : "me-1"} />
                    {loading ? "Recording..." : `Add Lead & Create ${typeLabel} Ticket`}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </Block>
      </Content>
    </>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(AddLead);
