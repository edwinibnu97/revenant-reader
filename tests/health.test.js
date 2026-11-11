'use strict';

/**
 * Integration test for GET /api/health.
 *
 * Spawns server.js on a random port (PORT=0 is not usable with spawn, so we
 * probe for a free port first — matching the pattern used in mcp.test.js),
 * calls GET /api/health, and asserts HTTP 200 + { status: 'ok' }.
 *
 * No network access beyond localhost; no live RSS feeds are contacted.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

/** Find a free TCP port on 127.0.0.1. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** Spawn server.js and wait until it logs "listening". */
function startAppServer(port, dataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('listening')) resolve({ child, port });
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server start timeout')), 8000);
  });
}

test('GET /api/health returns 200 and { status: "ok" }', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-health-test-'));
  // Provide an empty feeds file so the store doesn't attempt seed loading.
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);

    assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}`);
    assert.match(
      res.headers.get('content-type') || '',
      /application\/json/,
      'Expected Content-Type application/json'
    );

    const json = await res.json();
    assert.deepEqual(json, { status: 'ok' }, 'Response body must be { status: "ok" }');
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
