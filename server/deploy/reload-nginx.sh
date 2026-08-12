#!/usr/bin/env bash
set -euo pipefail
nginx -t >/dev/null 2>&1
systemctl reload nginx
