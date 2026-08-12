#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/opt/luo-yi-ba-multiplayer
RELEASE_ARCHIVE=/tmp/aliyun-multiplayer-release.tar.gz

install -d -o luoyiba -g luoyiba "$APP_ROOT/server/data/rooms"
tar -xzf "$RELEASE_ARCHIVE" -C "$APP_ROOT"
chown -R luoyiba:luoyiba "$APP_ROOT/server" "$APP_ROOT/web"

cd "$APP_ROOT/server"
NPM_CLI=$(find /root/.nvm/versions/node -path '*/lib/node_modules/npm/bin/npm-cli.js' -type f | sort -V | tail -n 1)
if [[ -z "$NPM_CLI" ]]; then
  echo 'npm executable was not found under /root/.nvm' >&2
  exit 1
fi
NVM_NODE=${NPM_CLI%/lib/node_modules/npm/bin/npm-cli.js}/bin/node
"$NVM_NODE" "$NPM_CLI" ci --omit=dev --no-audit --no-fund
chown -R luoyiba:luoyiba "$APP_ROOT/server/node_modules"

install -m 0644 "$APP_ROOT/server/deploy/luo-yi-ba-multiplayer.service" /etc/systemd/system/luo-yi-ba-multiplayer.service
install -m 0644 "$APP_ROOT/server/deploy/nginx.conf" /etc/nginx/sites-available/luo-yi-ba-multiplayer
ln -sfn /etc/nginx/sites-available/luo-yi-ba-multiplayer /etc/nginx/sites-enabled/luo-yi-ba-multiplayer
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable luo-yi-ba-multiplayer.service
systemctl restart luo-yi-ba-multiplayer.service
systemctl reload nginx
systemctl --no-pager --full status luo-yi-ba-multiplayer.service
