#!/bin/sh
set -eu

variant="${1:-standard}"

case "$variant" in
  standard)
    source_dir="/usr/share/nginx/html"
    ;;
  profiling)
    source_dir="/usr/share/nginx/html-profiling"
    ;;
  *)
    echo "Unsupported web build variant: $variant" >&2
    echo "Expected one of: standard, profiling" >&2
    exit 1
    ;;
esac

rm -rf /usr/share/nginx/active
cp -R "$source_dir" /usr/share/nginx/active
rm -rf /usr/share/nginx/html
mv /usr/share/nginx/active /usr/share/nginx/html

exec /docker-entrypoint.sh nginx -g 'daemon off;'
