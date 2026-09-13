import { http } from "./http";

const HotspotAPI = {
  getDashboard: () => http.get("/hotspot/dashboard").then((response) => response.data),
  getRouters: () => http.get("/hotspot/routers").then((response) => response.data),
  getUsers: (params = {}) =>
    http.get("/hotspot/users", { params }).then((response) => response.data),
  setUserStatus: (payload) =>
    http.patch("/hotspot/users/status", payload).then((response) => response.data),
  getSessions: (routerId = "all") =>
    http
      .get("/hotspot/sessions", {
        params: routerId && routerId !== "all" ? { router_id: routerId } : { router_id: "all" },
        timeout: 60000,
      })
      .then((response) => response.data),
  disconnectSession: (payload) =>
    http.post("/hotspot/sessions/disconnect", payload).then((response) => response.data),
  getSiteEarnings: (params = {}) =>
    http.get("/hotspot/site-earnings", { params }).then((response) => response.data),
  getAuthLocations: (params = {}) =>
    http.get("/hotspot/auth-locations", { params }).then((response) => response.data),
  getLiveAuth: (params = {}) =>
    http
      .get("/hotspot/live-auth", {
        params,
        timeout: 25000,
      })
      .then((response) => response.data),
  getLogs: () => http.get("/hotspot/logs").then((response) => response.data),
  getLogTail: (file, lines = 200) =>
    http
      .get("/hotspot/logs/tail", { params: { file, lines } })
      .then((response) => response.data),
};

export default HotspotAPI;
