#!/bin/sh
set -eu

json_value() {
  value="$1"
  if [ -z "$value" ]; then
    printf 'null'
    return
  fi

  escaped=$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '"%s"' "$escaped"
}

cat >/usr/share/nginx/html/config.js <<EOF
window.__HEXAGONIA_CONFIG__ = {
  apiBaseUrl: $(json_value "${VITE_API_BASE_URL:-}"),
  wsUrl: $(json_value "${VITE_WS_URL:-}"),
  recaptchaSiteKey: $(json_value "${RECAPTCHA_SITE_KEY:-}")
};
EOF
