/**
 * Render.com startup script for MeshCentral
 * 
 * This script generates the appropriate config.json for Render.com's environment
 * and then starts MeshCentral. Render.com provides:
 * - PORT env var (the port the app must listen on, typically 10000)
 * - TLS termination at the edge (so we use tlsOffload)
 * - Single port exposure (no separate redirect/MPS ports)
 * 
 * Usage (set in Render dashboard):
 *   Build Command:  npm install
 *   Start Command:  node render-start.js
 * 
 * Environment variables to set in Render dashboard:
 *   RENDER_EXTERNAL_HOSTNAME - Automatically set by Render to your .onrender.com URL
 *   SESSION_KEY    - A random secret for session encryption (auto-generated if not set)
 *   ALLOW_NEW_ACCOUNTS - "true" or "false" (default: "true")
 *   WEBRTC         - "true" or "false" (default: "false")
 *   MINIFY         - "true" or "false" (default: "true")
 *   IFRAME         - "true" or "false" (default: "false")
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Render.com provides the PORT environment variable
const port = parseInt(process.env.PORT) || 10000;
// RENDER_EXTERNAL_HOSTNAME is the correct external URL set by Render (e.g. myapp-xxxx.onrender.com)
// HOSTNAME on Linux containers is the internal container ID, NOT the external URL
const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || process.env.HOSTNAME || 'localhost';
console.log('ENV DEBUG: RENDER_EXTERNAL_HOSTNAME=' + (process.env.RENDER_EXTERNAL_HOSTNAME || '(not set)'));
console.log('ENV DEBUG: HOSTNAME=' + (process.env.HOSTNAME || '(not set)'));
const sessionKey = process.env.SESSION_KEY || crypto.randomBytes(32).toString('hex');
const allowNewAccounts = (process.env.ALLOW_NEW_ACCOUNTS || 'true').toLowerCase() === 'true';
const webrtc = (process.env.WEBRTC || 'false').toLowerCase() === 'true';
const minify = (process.env.MINIFY || 'true').toLowerCase() === 'true';
const iframe = (process.env.IFRAME || 'false').toLowerCase() === 'true';

// Determine the data path
const datapath = path.join(__dirname, 'meshcentral-data');
const configFilePath = path.join(datapath, 'config.json');

// Ensure data directories exist
const dirs = ['meshcentral-data', 'meshcentral-files', 'meshcentral-backups'];
for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    try { fs.mkdirSync(dirPath, { recursive: true }); } catch (ex) { }
}

// Check if existing certificates match the current hostname.
// If hostname changed (e.g., old deploy had wrong HOSTNAME), force regeneration.
const certCheckFile = path.join(datapath, 'cert-hostname.txt');
let forceRegenerate = false;
try {
    if (fs.existsSync(certCheckFile)) {
        const oldHostname = fs.readFileSync(certCheckFile, 'utf8').trim();
        if (oldHostname !== hostname) {
            console.log('Hostname changed from "' + oldHostname + '" to "' + hostname + '". Regenerating certificates...');
            // Delete old certificates so MeshCentral regenerates them with the correct hostname
            const certFiles = ['webserver-cert-public.crt', 'webserver-cert-private.key',
                'agent-cert-public.crt', 'agent-cert-private.key',
                'root-cert-public.crt', 'root-cert-private.key',
                'mps-cert-public.crt', 'mps-cert-private.key',
                'codesign-cert-public.crt', 'codesign-cert-private.key'];
            for (const f of certFiles) {
                try { fs.unlinkSync(path.join(datapath, f)); } catch (ex) { }
            }
            // Also delete config.json so it regenerates with correct hostname
            try { fs.unlinkSync(configFilePath); } catch (ex) { }
            forceRegenerate = true;
        }
    } else {
        forceRegenerate = true;
    }
} catch (ex) { forceRegenerate = true; }

console.log('============================================');
console.log('  MeshCentral on Render.com');
console.log('  Port: ' + port);
console.log('  Hostname: ' + hostname);
console.log('============================================');

// Generate or update config.json
if (!fs.existsSync(configFilePath)) {
    console.log('Generating initial config.json...');
    const config = {
        "$schema": "https://raw.githubusercontent.com/Ylianst/MeshCentral/master/meshcentral-config-schema.json",
        "settings": {
            "plugins": { "enabled": false },
            "cert": hostname,
            "WANonly": true,
            "port": port,
            "aliasPort": 443,
            "redirPort": 0,
            "mpsPort": 0,
            "tlsOffload": true,
            "trustedProxy": "0.0.0.0/0",
            "exactPorts": true,
            "sessionKey": sessionKey,
            "allowFraming": iframe,
            "webRTC": webrtc,
            "selfUpdate": false,
            "agentPong": 60,
            "allowLoginToken": true,
            "allowHighQualityDesktop": true,
            "agentCoreDump": false,
            "compression": true,
            "wsCompression": false,
            "agentWsCompression": false
        },
        "domains": {
            "": {
                "title": "MeshCentral",
                "title2": "Remote Management",
                "minify": minify,
                "newAccounts": allowNewAccounts,
                "localSessionRecording": false,
                "allowedOrigin": false
            }
        }
    };
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    fs.writeFileSync(certCheckFile, hostname);
    console.log('Config generated successfully.');
} else {
    console.log('Existing config.json found, updating port and TLS settings...');
    try {
        const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        if (!config.settings) { config.settings = {}; }
        config.settings.port = port;
        config.settings.aliasPort = 443;
        config.settings.redirPort = 0;
        config.settings.mpsPort = 0;
        config.settings.tlsOffload = true;
        config.settings.exactPorts = true;
        config.settings.WANonly = true;
        config.settings.cert = hostname;
        config.settings.agentPong = 60;
        if (!config.settings.trustedProxy) { config.settings.trustedProxy = "0.0.0.0/0"; }
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
        fs.writeFileSync(certCheckFile, hostname);
        console.log('Config updated.');
    } catch (ex) {
        console.log('WARNING: Could not update existing config.json: ' + ex.message);
    }
}

// Start MeshCentral as the main process (so require.main === module is true inside meshcentral.js)
// We use spawn instead of require() because meshcentral.js needs to be the main module
// to trigger its built-in parent-child process management for crash recovery.
console.log('Starting MeshCentral on port ' + port + '...');
const { spawn } = require('child_process');
const child = spawn(process.execPath, [
    path.join(__dirname, 'meshcentral.js'),
    '--datapath', datapath,
    '--port', String(port)
], {
    stdio: 'inherit',
    cwd: __dirname
});

// Forward signals so Render's graceful shutdown works
process.on('SIGTERM', () => { child.kill('SIGINT'); }); // MeshCentral listens for SIGINT
process.on('SIGINT', () => { child.kill('SIGINT'); });
child.on('exit', (code) => { process.exit(code || 0); });
