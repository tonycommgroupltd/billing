import React from "react";
import AdminCrudList from "../AdminCrudList";
import {
  createPartner,
  deletePartner,
  fetchPartners,
  updatePartner,
} from "../../../helpers/adminHubApi";

const columns = [
  { name: "Name", selector: (r) => r.name, sortable: true, grow: 2 },
  { name: "Contact", selector: (r) => r.contact || "—", sortable: true },
  { name: "Phone", selector: (r) => r.phone || "—", sortable: true },
  { name: "Email", selector: (r) => r.email || "—", sortable: true, grow: 2 },
];

const fields = [
  { name: "name", label: "Partner name", col: 6 },
  { name: "contact", label: "Contact person", col: 6 },
  { name: "phone", label: "Phone", col: 6 },
  { name: "email", label: "Email", type: "email", col: 6 },
  { name: "notes", label: "Notes", type: "textarea", col: 12 },
];

const PartnersList = () => (
  <AdminCrudList
    title="Partners"
    description="Business partners used for operations and ticket filtering."
    columns={columns}
    fields={fields}
    load={fetchPartners}
    create={createPartner}
    update={updatePartner}
    remove={deletePartner}
  />
);

export default PartnersList;
