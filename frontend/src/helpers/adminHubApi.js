import { http } from "./http";

export const fetchPartners = () => http.get("/admin-hub/partners");
export const createPartner = (payload) => http.post("/admin-hub/partners", payload);
export const updatePartner = (id, payload) => http.put(`/admin-hub/partners/${id}`, payload);
export const deletePartner = (id) => http.delete(`/admin-hub/partners/${id}`);

export const fetchLocations = () => http.get("/admin-hub/locations");
export const createLocation = (payload) => http.post("/admin-hub/locations", payload);
export const updateLocation = (id, payload) => http.put(`/admin-hub/locations/${id}`, payload);
export const deleteLocation = (id) => http.delete(`/admin-hub/locations/${id}`);

export const fetchApiKeys = () => http.get("/admin-hub/api-keys");
export const fetchLicense = () => http.get("/admin-hub/license");
export const fetchAdminReport = (type, params = {}) => http.get(`/admin-hub/reports/${type}`, { params });
