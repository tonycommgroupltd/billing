import { http } from './http';

const SERVERS = {
  production: { id: 'production', label: 'Production (Contabo)', target: 'local', hint: 'isp.tonycommgroupltd.com' },
  standby: { id: 'standby', label: 'Standby (acs.tcom.co.ke)', target: 'standby', hint: 'acs.tcom.co.ke' },
};

export function getLogServers() {
  return Object.values(SERVERS);
}

function targetParam(serverId) {
  const server = SERVERS[serverId] || SERVERS.production;
  return server.target === 'standby' ? { target: 'standby' } : {};
}

export async function fetchLogCatalog(serverId) {
  const server = SERVERS[serverId] || SERVERS.production;
  const resp = await http.get('/server-logs/catalog', { params: targetParam(serverId) });
  return { server, data: resp.data };
}

export async function fetchLogTail(serverId, source, lines = 200) {
  const server = SERVERS[serverId] || SERVERS.production;
  const resp = await http.get('/server-logs/tail', {
    params: { source, lines, ...targetParam(serverId) },
  });
  return { server, data: resp.data };
}

export async function fetchReportFile(serverId, name, lines = 200) {
  const server = SERVERS[serverId] || SERVERS.production;
  const resp = await http.get('/server-logs/report', {
    params: { name, lines, ...targetParam(serverId) },
  });
  return { server, data: resp.data };
}

export const LOG_GROUPS = {
  application: 'Application',
  web: 'Web server',
  system: 'System',
  radius: 'RADIUS',
  reports: 'App report files',
};
