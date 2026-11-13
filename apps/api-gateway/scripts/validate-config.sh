#!/usr/bin/env sh
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_YAML="$DIR/conf/config.yaml"
TEMPLATE_YAML="$DIR/conf/apisix.yaml.template"

echo "==> [validate-config] Checking configuration files..."

if [ ! -f "$CONFIG_YAML" ]; then
  echo "Error: $CONFIG_YAML does not exist."
  exit 1
fi

if [ ! -f "$TEMPLATE_YAML" ]; then
  echo "Error: $TEMPLATE_YAML does not exist."
  exit 1
fi

# 1. Check for #END marker at the end of apisix.yaml.template
LAST_LINE=$(tail -n 1 "$TEMPLATE_YAML" | tr -d '\r\n')
if [ "$LAST_LINE" != "#END" ]; then
  echo "Error: $TEMPLATE_YAML must end with '#END' marker for APISIX Stand-alone hot-reload."
  echo "Current last line: '$LAST_LINE'"
  exit 1
fi
echo "==> [validate-config] #END marker check passed."

# 2. Check root-level dns_resolver in config.yaml
if ! grep -q "^dns_resolver:" "$CONFIG_YAML"; then
  echo "Error: $CONFIG_YAML must define 'dns_resolver:' at root level."
  exit 1
fi
echo "==> [validate-config] Root-level dns_resolver check passed."

# 3. Check required environment variable placeholders in apisix.yaml.template
for VAR in UPSTREAM_AUTH_SCHEME UPSTREAM_AUTH_HOST UPSTREAM_AUTH_PORT UPSTREAM_FINANCE_SCHEME UPSTREAM_FINANCE_HOST UPSTREAM_FINANCE_PORT UPSTREAM_AI_SCHEME UPSTREAM_AI_HOST UPSTREAM_AI_PORT UPSTREAM_LEARNING_SCHEME UPSTREAM_LEARNING_HOST UPSTREAM_LEARNING_PORT; do
  if ! grep -q "\${${VAR}}" "$TEMPLATE_YAML"; then
    echo "Error: $TEMPLATE_YAML is missing required placeholder \${${VAR}}."
    exit 1
  fi
done

# 4. Ensure internal event routes are never exposed through the public API gateway
if grep -qE '/internal(/|\*|$|[[:space:]]|")' "$TEMPLATE_YAML"; then
  echo "Error: $TEMPLATE_YAML must not expose /internal/* endpoints publicly."
  exit 1
fi
echo "==> [validate-config] Internal event boundary check passed."

TEMPLATE_BYTES=$(wc -c < "$TEMPLATE_YAML" | tr -d ' ')
echo "==> [validate-config] Template size: ${TEMPLATE_BYTES} bytes"
echo "==> [validate-config] All configuration checks passed successfully."
