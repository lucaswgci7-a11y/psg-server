#!/bin/bash
# Render.com entrypoint for MeshCentral
# Generates config.json from environment variables and starts MeshCentral

set -e

CONFIG_FILE="/opt/meshcentral/meshcentral-data/config.json"

# Render provides PORT env var; default to 10000 if not set
RENDER_PORT="${PORT:-10000}"

# HOSTNAME should be set to your Render service URL (e.g., meshcentral-xxxx.onrender.com)
MC_HOSTNAME="${HOSTNAME:-localhost}"

# Session key - should be set via Render env vars
MC_SESSION_KEY="${SESSION_KEY:-$(head -c 32 /dev/urandom | base64)}"

# Feature flags
MC_ALLOW_NEW_ACCOUNTS="${ALLOW_NEW_ACCOUNTS:-true}"
MC_WEBRTC="${WEBRTC:-false}"
MC_MINIFY="${MINIFY:-true}"
MC_IFRAME="${IFRAME:-false}"

echo "============================================"
echo "  MeshCentral on Render.com"
echo "  Port: ${RENDER_PORT}"
echo "  Hostname: ${MC_HOSTNAME}"
echo "============================================"

# Only generate config if it doesn't already exist
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Generating initial config.json..."
    cat > "$CONFIG_FILE" <<CONFIGEOF
{
  "\$schema": "https://raw.githubusercontent.com/Ylianst/MeshCentral/master/meshcentral-config-schema.json",
  "settings": {
    "plugins": {
      "enabled": false
    },
    "cert": "${MC_HOSTNAME}",
    "WANonly": true,
    "port": ${RENDER_PORT},
    "aliasPort": 443,
    "redirPort": 0,
    "mpsPort": 0,
    "tlsOffload": true,
    "trustedProxy": "0.0.0.0/0",
    "exactPorts": true,
    "sessionKey": "${MC_SESSION_KEY}",
    "allowFraming": ${MC_IFRAME},
    "webRTC": ${MC_WEBRTC},
    "selfUpdate": false,
    "agentPong": 300,
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
      "minify": ${MC_MINIFY},
      "newAccounts": ${MC_ALLOW_NEW_ACCOUNTS},
      "localSessionRecording": false,
      "allowedOrigin": false
    }
  }
}
CONFIGEOF
    echo "Config generated successfully."
else
    echo "Existing config.json found. Updating port and TLS settings..."
    # Update the port to match Render's PORT env var
    if command -v jq &> /dev/null; then
        TMP_FILE=$(mktemp)
        jq --argjson port "$RENDER_PORT" \
           '.settings.port = $port | .settings.aliasPort = 443 | .settings.redirPort = 0 | .settings.mpsPort = 0 | .settings.tlsOffload = true | .settings.exactPorts = true | .settings.WANonly = true' \
           "$CONFIG_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$CONFIG_FILE"
        echo "Config updated."
    else
        echo "WARNING: jq not available, cannot update existing config. Ensure port ${RENDER_PORT} is configured."
    fi
fi

echo "Starting MeshCentral..."
cd /opt/meshcentral
exec node meshcentral/meshcentral.js --datapath /opt/meshcentral/meshcentral-data --port "$RENDER_PORT"
