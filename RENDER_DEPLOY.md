# Deploying MeshCentral on Render.com

## Overview

This guide covers two deployment methods for MeshCentral on Render.com:
1. **Docker deployment** (recommended) — uses `Dockerfile.render`
2. **Native Node.js deployment** — uses `render-start.js`

## Key Render.com Constraints

- Render provides a **single `PORT` environment variable** (typically `10000`) that your app must listen on.
- Render **terminates TLS** at the edge, so your app receives plain HTTP traffic.
- Only **one port** is exposed per service — no separate redirect or MPS ports.
- The external URL is always HTTPS on port 443.

The deployment files handle all of these automatically by:
- Setting `tlsOffload: true` (Render handles HTTPS)
- Setting `aliasPort: 443` (so agents connect on the right external port)
- Disabling `redirPort` and `mpsPort` (set to `0`)
- Setting `WANonly: true`
- Setting `exactPorts: true`
- Trusting the Render proxy

---

## Method 1: Docker Deployment (Recommended)

### Quick Deploy with Blueprint

1. Push this repo to GitHub/GitLab
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** → **Blueprint**
4. Connect your repository
5. Render will auto-detect `render.yaml` and configure everything
6. Set the `HOSTNAME` environment variable to your Render service URL (e.g., `meshcentral-xxxx.onrender.com`)
7. Deploy

### Manual Docker Service Setup

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your repository
3. Select **Docker** as the environment
4. Set **Dockerfile Path** to `./Dockerfile.render`
5. Add environment variables:
   | Variable | Value | Required |
   |---|---|---|
   | `HOSTNAME` | `your-service.onrender.com` | **Yes** |
   | `SESSION_KEY` | (random string) | Recommended |
   | `ALLOW_NEW_ACCOUNTS` | `true` | No (default: true) |
   | `WEBRTC` | `false` | No (default: false) |
6. Add a **Disk**:
   - Name: `meshcentral-data`
   - Mount Path: `/opt/meshcentral/meshcentral-data`
   - Size: 1 GB (or more as needed)
7. Deploy

---

## Method 2: Native Node.js Deployment

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your repository
3. Select **Node** as the environment
4. Set the commands:
   - **Build Command:** `npm install`
   - **Start Command:** `node render-start.js`
5. Add environment variables (same as Docker method above)
6. Add a **Disk**:
   - Name: `meshcentral-data`
   - Mount Path: `/opt/meshcentral/meshcentral-data` (or use default working directory path)
   - Size: 1 GB
7. Deploy

---

## Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `PORT` | Auto-set by Render — do NOT change | `10000` |
| `HOSTNAME` | Your Render external URL | `localhost` |
| `SESSION_KEY` | Secret key for session encryption | Auto-generated |
| `ALLOW_NEW_ACCOUNTS` | Allow new user registration | `true` |
| `WEBRTC` | Enable WebRTC | `false` |
| `MINIFY` | Minify web pages | `true` |
| `IFRAME` | Allow framing | `false` |

---

## Important Notes

### Persistent Storage
Render's filesystem is **ephemeral** by default. You **must** attach a [Render Disk](https://render.com/docs/disks) to persist:
- User accounts and settings (`meshcentral-data/`)
- Uploaded files (`meshcentral-files/`)

Without a disk, all data is lost on every deploy or restart.

### Health Checks
The `render.yaml` blueprint configures a health check at `/health.ashx`. This endpoint is built into MeshCentral.

### Agent Connections
Since Render terminates TLS, agents will connect via the standard HTTPS port 443. The `aliasPort: 443` setting ensures MeshCentral generates correct agent installation URLs.

### WebSocket Support
Render.com supports WebSockets natively, which is required for MeshCentral's real-time features.

### Free Tier Limitations
On Render's free tier, services spin down after inactivity. This means:
- First request after idle may take 30+ seconds
- Agent connections will be interrupted during spin-down
- Consider using the **Starter** plan or higher for production use

### Custom Domain
To use a custom domain:
1. Add the domain in Render Dashboard → Settings → Custom Domains
2. Update the `HOSTNAME` env var to match your custom domain
3. Restart the service (the config will auto-update)

---

## Troubleshooting

### "Port already in use" or binding errors
This is handled automatically. The config sets `exactPorts: true` and uses Render's `PORT` env var.

### Certificate errors
Expected — MeshCentral generates self-signed certs internally, but Render handles the real TLS. The `tlsOffload: true` setting makes MeshCentral serve HTTP, which Render wraps in HTTPS.

### Agent not connecting
Verify that:
- `HOSTNAME` is set correctly to your Render URL
- `aliasPort` is `443` in the config
- Agents are configured to use `wss://your-hostname.onrender.com`

### 503 errors during deploy
Normal during deployment. Render's health check at `/health.ashx` will mark the service as healthy once MeshCentral finishes starting.
