import { http } from './http';

export async function fetchEmergencyBypassStatus() {
  const resp = await http.get('/emergency-bypass/status');
  return resp.data;
}

export async function fetchEmergencyBypassSyncProgress() {
  const resp = await http.get('/emergency-bypass/sync-progress', { timeout: 120000 });
  return resp.data;
}

export async function setEmergencyBypassMode(mode, { activeOnly = false } = {}) {
  const resp = await http.post(
    '/emergency-bypass/mode',
    { mode, active_only: activeOnly },
    { timeout: 600000 }
  );
  return resp.data;
}

export async function syncEmergencyBypassSecrets({ activeOnly = false } = {}) {
  const resp = await http.post(
    '/emergency-bypass/sync',
    { active_only: activeOnly },
    { timeout: 600000 }
  );
  return resp.data;
}
