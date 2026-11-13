#!/usr/bin/env sh
set -e

# 1. Parse UPSTREAM_AUTH_URL
AUTH_URL="${UPSTREAM_AUTH_URL:-http://127.0.0.1:8081}"

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

# 2. Parse UPSTREAM_FINANCE_URL
FINANCE_URL="${UPSTREAM_FINANCE_URL:-http://127.0.0.1:8083}"

FINANCE_SCHEME=$(echo "$FINANCE_URL" | sed -n 's|^\([a-zA-Z]*\)://.*|\1|p')
FINANCE_SCHEME="${FINANCE_SCHEME:-http}"

FINANCE_REST=$(echo "$FINANCE_URL" | sed -e 's|^[a-zA-Z]*://||')
FINANCE_HOST_PORT=$(echo "$FINANCE_REST" | cut -d'/' -f1)
FINANCE_HOST=$(echo "$FINANCE_HOST_PORT" | cut -d':' -f1)
FINANCE_PORT=$(echo "$FINANCE_HOST_PORT" | sed -n 's|^.*:\([0-9]*\)$|\1|p')

if [ -z "$FINANCE_PORT" ]; then
  if [ "$FINANCE_SCHEME" = "https" ]; then
    FINANCE_PORT="443"
  else
    FINANCE_PORT="80"
  fi
fi

export UPSTREAM_FINANCE_SCHEME="$FINANCE_SCHEME"
export UPSTREAM_FINANCE_HOST="$FINANCE_HOST"
export UPSTREAM_FINANCE_PORT="$FINANCE_PORT"

echo "==> [innova-api-gateway] Finance upstream configured: ${UPSTREAM_FINANCE_SCHEME}://${UPSTREAM_FINANCE_HOST}:${UPSTREAM_FINANCE_PORT}"

# 3. Parse UPSTREAM_AI_URL
AI_URL="${UPSTREAM_AI_URL:-http://127.0.0.1:8084}"

AI_SCHEME=$(echo "$AI_URL" | sed -n 's|^\([a-zA-Z]*\)://.*|\1|p')
AI_SCHEME="${AI_SCHEME:-http}"

AI_REST=$(echo "$AI_URL" | sed -e 's|^[a-zA-Z]*://||')
AI_HOST_PORT=$(echo "$AI_REST" | cut -d'/' -f1)
AI_HOST=$(echo "$AI_HOST_PORT" | cut -d':' -f1)
AI_PORT=$(echo "$AI_HOST_PORT" | sed -n 's|^.*:\([0-9]*\)$|\1|p')

if [ -z "$AI_PORT" ]; then
  if [ "$AI_SCHEME" = "https" ]; then
    AI_PORT="443"
  else
    AI_PORT="80"
  fi
fi

export UPSTREAM_AI_SCHEME="$AI_SCHEME"
export UPSTREAM_AI_HOST="$AI_HOST"
export UPSTREAM_AI_PORT="$AI_PORT"

echo "==> [innova-api-gateway] AI upstream configured: ${UPSTREAM_AI_SCHEME}://${UPSTREAM_AI_HOST}:${UPSTREAM_AI_PORT}"

# 4. Parse UPSTREAM_LEARNING_URL
LEARNING_URL="${UPSTREAM_LEARNING_URL:-http://127.0.0.1:8082}"

LEARNING_SCHEME=$(echo "$LEARNING_URL" | sed -n 's|^\([a-zA-Z]*\)://.*|\1|p')
LEARNING_SCHEME="${LEARNING_SCHEME:-http}"

LEARNING_REST=$(echo "$LEARNING_URL" | sed -e 's|^[a-zA-Z]*://||')
LEARNING_HOST_PORT=$(echo "$LEARNING_REST" | cut -d'/' -f1)
LEARNING_HOST=$(echo "$LEARNING_HOST_PORT" | cut -d':' -f1)
LEARNING_PORT=$(echo "$LEARNING_HOST_PORT" | sed -n 's|^.*:\([0-9]*\)$|\1|p')

if [ -z "$LEARNING_PORT" ]; then
  if [ "$LEARNING_SCHEME" = "https" ]; then
    LEARNING_PORT="443"
  else
    LEARNING_PORT="80"
  fi
fi

export UPSTREAM_LEARNING_SCHEME="$LEARNING_SCHEME"
export UPSTREAM_LEARNING_HOST="$LEARNING_HOST"
export UPSTREAM_LEARNING_PORT="$LEARNING_PORT"

echo "==> [innova-api-gateway] Learning upstream configured: ${UPSTREAM_LEARNING_SCHEME}://${UPSTREAM_LEARNING_HOST}:${UPSTREAM_LEARNING_PORT}"

# 5. Substitute environment variables in apisix.yaml.template
CONF_DIR="/usr/local/apisix/conf"
mkdir -p "$CONF_DIR"

if [ -f "/app/conf/config.yaml" ]; then
  cp /app/conf/config.yaml "$CONF_DIR/config.yaml"
fi

if [ -f "/app/conf/apisix.yaml.template" ]; then
  envsubst '${UPSTREAM_AUTH_SCHEME} ${UPSTREAM_AUTH_HOST} ${UPSTREAM_AUTH_PORT} ${UPSTREAM_FINANCE_SCHEME} ${UPSTREAM_FINANCE_HOST} ${UPSTREAM_FINANCE_PORT} ${UPSTREAM_AI_SCHEME} ${UPSTREAM_AI_HOST} ${UPSTREAM_AI_PORT} ${UPSTREAM_LEARNING_SCHEME} ${UPSTREAM_LEARNING_HOST} ${UPSTREAM_LEARNING_PORT}' \
    < /app/conf/apisix.yaml.template > "$CONF_DIR/apisix.yaml"
  echo "==> [innova-api-gateway] Generated $CONF_DIR/apisix.yaml successfully."
fi

# 6. Execute original APISIX entrypoint or command
if [ "$1" = "docker-start" ] || [ -z "$1" ]; then
  exec /docker-entrypoint.sh docker-start
else
  exec "$@"
fi
