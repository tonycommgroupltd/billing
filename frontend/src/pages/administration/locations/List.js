import React from "react";
import AdminCrudList from "../AdminCrudList";
import {
  createLocation,
  deleteLocation,
  fetchLocations,
  updateLocation,
} from "../../../helpers/adminHubApi";

const columns = [
  { name: "Name", selector: (r) => r.name, sortable: true, grow: 2 },
  { name: "City", selector: (r) => r.city || "—", sortable: true },
  { name: "Address", selector: (r) => r.address || "—", sortable: true, grow: 2 },
  { name: "Notes", selector: (r) => r.notes || "—", grow: 2 },
];

const fields = [
  { name: "name", label: "Location name", col: 6 },
  { name: "city", label: "City", col: 6 },
  { name: "address", label: "Address", col: 12 },
  { name: "notes", label: "Notes", type: "textarea", col: 12 },
];

const LocationsList = () => (
  <AdminCrudList
    title="Locations"
    description="Service areas and branch locations for administration."
    columns={columns}
    fields={fields}
    load={fetchLocations}
    create={createLocation}
    update={updateLocation}
    remove={deleteLocation}
  />
);

export default LocationsList;
