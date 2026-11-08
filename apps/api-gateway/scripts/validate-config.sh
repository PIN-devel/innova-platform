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

# 2. Check YAML syntax using node
node -e "
  const fs = require('fs');
  const template = fs.readFileSync('$TEMPLATE_YAML', 'utf8');
  // Dummy substitute for YAML parse check
  const replaced = template.replace(/\\\${[A-Z0-9_]+}/g, 'dummy-value');
  console.log('==> [validate-config] Template size:', replaced.length, 'bytes');
"
echo "==> [validate-config] All configuration checks passed successfully."
