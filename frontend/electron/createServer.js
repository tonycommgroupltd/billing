/**
 * Local gateway for the desktop app: serve the CRA build and proxy
 * Contabo / standby APIs (same routes as src/setupProxy.js).
 */
const path = require('path');
const express = require('express');
const setupProxy = require('./proxyRoutes');

const DEFAULT_PORT = 17890;

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function createDesktopServer(preferredPort = DEFAULT_PORT) {
  const app = express();
  setupProxy(app);

  const buildPath = path.join(__dirname, '..', 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });

  let server;
  try {
    server = await listen(app, preferredPort);
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
    server = await listen(app, 0);
  }

  const { port } = server.address();
  return { server, port, url: `http://127.0.0.1:${port}` };
}

module.exports = { createDesktopServer, DEFAULT_PORT };
