const { spawnSync } = require('child_process');

function sshPassword(envKey) {
  if (!envKey) return null;
  return process.env[envKey] || null;
}

function findSshpass() {
  for (const bin of ['/usr/bin/sshpass', '/usr/local/bin/sshpass', 'sshpass']) {
    const r = spawnSync(bin, ['-V'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return null;
}

function runLocal(hub, remoteCommand, timeoutMs = 30000) {
  const password = sshPassword(hub.ssh_password_env);
  const shellCmd = password
    ? `echo '${password.replace(/'/g, "'\\''")}' | sudo -S ${remoteCommand}`
    : `sudo ${remoteCommand}`;

  const result = spawnSync('bash', ['-lc', shellCmd], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || '').trim() || `local exit ${result.status}`;
    throw new Error(msg);
  }

  return (result.stdout || '').trim();
}

function runOnHub(hub, remoteCommand, timeoutMs = 30000) {
  if (hub.local_management) {
    return runLocal(hub, remoteCommand, timeoutMs);
  }

  const password = sshPassword(hub.ssh_password_env);
  if (!password) {
    throw new Error(
      `SSH password not configured. Set ${hub.ssh_password_env} in vpn-api .env`
    );
  }

  const sshpass = findSshpass();
  if (!sshpass) {
    throw new Error('sshpass not installed on VPS — use manual command below');
  }

  const sshHost = hub.ssh_host || hub.host;
  const sshUser = hub.ssh_user || 'root';
  const sshPort = String(hub.ssh_port || 22);

  const result = spawnSync(
    sshpass,
    [
      '-p',
      password,
      'ssh',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-p',
      sshPort,
      `${sshUser}@${sshHost}`,
      remoteCommand,
    ],
    { encoding: 'utf8', timeout: timeoutMs }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || '').trim() || `ssh exit ${result.status}`;
    throw new Error(msg);
  }

  return (result.stdout || '').trim();
}

function parseWgConf(output) {
  const names = {};
  const lines = output.split(/\r?\n/);
  let pendingName = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#')) {
      pendingName = line.slice(1).trim() || null;
      continue;
    }
    if (line.startsWith('[Peer]')) {
      pendingName = pendingName || null;
      continue;
    }
    if (line.startsWith('PublicKey =') || line.startsWith('PublicKey=')) {
      const key = line.split('=').slice(1).join('=').trim();
      if (key && pendingName) names[key] = pendingName;
      pendingName = null;
    }
  }

  return names;
}

function parseWgShow(output) {
  const lines = output.split(/\r?\n/);
  let publicKey = null;
  const peers = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('public key:')) {
      publicKey = line.slice('public key:'.length).trim();
    } else if (line.startsWith('peer:')) {
      if (current) peers.push(current);
      current = { public_key: line.slice('peer:'.length).trim() };
    } else if (current && line.startsWith('allowed ips:')) {
      current.allowed_ips = line.slice('allowed ips:'.length).trim();
    } else if (current && line.startsWith('latest handshake:')) {
      current.latest_handshake = line.slice('latest handshake:'.length).trim();
    } else if (current && line.startsWith('endpoint:')) {
      current.endpoint = line.slice('endpoint:'.length).trim();
    }
  }
  if (current) peers.push(current);

  return { ok: true, public_key: publicKey, peers, raw: output };
}

module.exports = { runOnHub, runLocal, parseWgShow, parseWgConf, sshPassword };
