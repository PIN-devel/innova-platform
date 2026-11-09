#!/usr/bin/env sh
set -e

# 1. Parse UPSTREAM_RENDER_URL
UPSTREAM_URL="${UPSTREAM_RENDER_URL:-http://127.0.0.1:3000}"

SCHEME=$(echo "$UPSTREAM_URL" | sed -n 's|^\([a-zA-Z]*\)://.*|\1|p')
SCHEME="${SCHEME:-http}"

REST=$(echo "$UPSTREAM_URL" | sed -e 's|^[a-zA-Z]*://||')
HOST_PORT=$(echo "$REST" | cut -d'/' -f1)
HOST=$(echo "$HOST_PORT" | cut -d':' -f1)
PORT=$(echo "$HOST_PORT" | sed -n 's|^.*:\([0-9]*\)$|\1|p')

if [ -z "$PORT" ]; then
  if [ "$SCHEME" = "https" ]; then
    PORT="443"
  else
    PORT="80"
  fi
fi

export UPSTREAM_RENDER_SCHEME="$SCHEME"
export UPSTREAM_RENDER_HOST="$HOST"
export UPSTREAM_RENDER_PORT="$PORT"

echo "==> [innova-api-gateway] Render upstream configured: ${UPSTREAM_RENDER_SCHEME}://${UPSTREAM_RENDER_HOST}:${UPSTREAM_RENDER_PORT}"

# 2. Parse UPSTREAM_AUTH_URL (defaults to UPSTREAM_RENDER_URL if unset)
AUTH_URL="${UPSTREAM_AUTH_URL:-$UPSTREAM_URL}"

AUTH_SCHEME=$(echo "$AUTH_URL" | sed -n 's|^\([a-zA-Z]*\)://.*|\1|p')
AUTH_SCHEME="${AUTH_SCHEME:-http}"

AUTH_REST=$(echo "$AUTH_URL" | sed -e 's|^[a-zA-Z]*://||')
AUTH_HOST_PORT=$(echo "$AUTH_REST" | cut -d'/' -f1)
AUTH_HOST=$(echo "$AUTH_HOST_PORT" | cut -d':' -f1)
AUTH_PORT=$(echo "$AUTH_HOST_PORT" | sed -n 's|^.*:\([0-9]*\)$|\1|p')

if [ -z "$AUTH_PORT" ]; then
  if [ "$AUTH_SCHEME" = "https" ]; then
    AUTH_PORT="443"
  else
    AUTH_PORT="80"
  fi
fi

export UPSTREAM_AUTH_SCHEME="$AUTH_SCHEME"
export UPSTREAM_AUTH_HOST="$AUTH_HOST"
export UPSTREAM_AUTH_PORT="$AUTH_PORT"

echo "==> [innova-api-gateway] Auth upstream configured: ${UPSTREAM_AUTH_SCHEME}://${UPSTREAM_AUTH_HOST}:${UPSTREAM_AUTH_PORT}"

# 3. Substitute environment variables in apisix.yaml.template
CONF_DIR="/usr/local/apisix/conf"
mkdir -p "$CONF_DIR"

if [ -f "/app/conf/config.yaml" ]; then
  cp /app/conf/config.yaml "$CONF_DIR/config.yaml"
fi

if [ -f "/app/conf/apisix.yaml.template" ]; then
  envsubst '${UPSTREAM_RENDER_SCHEME} ${UPSTREAM_RENDER_HOST} ${UPSTREAM_RENDER_PORT} ${UPSTREAM_AUTH_SCHEME} ${UPSTREAM_AUTH_HOST} ${UPSTREAM_AUTH_PORT}' \
    < /app/conf/apisix.yaml.template > "$CONF_DIR/apisix.yaml"
  echo "==> [innova-api-gateway] Generated $CONF_DIR/apisix.yaml successfully."
fi

# 3. Execute original APISIX entrypoint or command
if [ "$1" = "docker-start" ] || [ -z "$1" ]; then
  exec /docker-entrypoint.sh docker-start
else
  exec "$@"
fi
