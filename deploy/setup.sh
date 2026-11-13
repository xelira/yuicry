#!/usr/bin/env bash
set -euo pipefail

role="${1:-api}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

say() {
  printf '\n== %s\n' "$1"
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates ffmpeg nginx certbot python3-certbot-nginx
}

install_deno() {
  if command -v deno >/dev/null 2>&1; then
    return
  fi
  curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o /tmp/deno.zip
  python3 -c "import zipfile; zipfile.ZipFile('/tmp/deno.zip').extractall('/usr/local/bin')"
  chmod 755 /usr/local/bin/deno
  rm -f /tmp/deno.zip
}

install_ytdlp() {
  if command -v yt-dlp >/dev/null 2>&1; then
    return
  fi
  curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
    -o /usr/local/bin/yt-dlp
  chmod 755 /usr/local/bin/yt-dlp
}

create_user() {
  id -u yuicry >/dev/null 2>&1 || useradd --system --home /var/lib/yuicry --shell /usr/sbin/nologin yuicry
  install -d -o yuicry -g yuicry /var/lib/yuicry
  install -d -o yuicry -g yuicry /var/lib/yuicry/cache
  install -d -o yuicry -g yuicry /var/lib/yuicry/tmp
  install -d /etc/yuicry
}

write_api_env() {
  if [ -f /etc/yuicry/api.env ]; then
    return
  fi

  secret="$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | head -c 48)"

  cat > /etc/yuicry/api.env <<EOF
ADDR=:10000
DB_PATH=/var/lib/yuicry/yuicry.db
CACHE_DIR=/var/lib/yuicry/cache
TEMP_DIR=/var/lib/yuicry/tmp
PUBLIC_DIR=/var/www/yuicry
STORAGE_ADDR=${STORAGE_ADDR:-}
YTDLP=/usr/local/bin/yt-dlp
OIDC_ISSUER=https://owaw.ru
OIDC_CLIENT_ID=yuicry
OIDC_REDIRECT=https://yuicry.owaw.online/api/auth/callback
SESSION_SECRET=$secret
COOKIE_SECURE=1
EOF

  chmod 600 /etc/yuicry/api.env
}

attach_haproxy() {
  if [ ! -f /etc/haproxy/haproxy.cfg ]; then
    return
  fi

  if grep -q "yuicry.owaw.online" /etc/haproxy/haproxy.cfg; then
    return
  fi

  sed -i 's/acl zen_hosts req.ssl_sni -i /acl zen_hosts req.ssl_sni -i yuicry.owaw.online /' /etc/haproxy/haproxy.cfg
  haproxy -c -f /etc/haproxy/haproxy.cfg >/dev/null
  systemctl reload haproxy
}

deploy_api() {
  say "пакеты"
  install_packages
  install_deno
  install_ytdlp

  say "пользователь и каталоги"
  create_user
  install -d /var/www/yuicry
  write_api_env

  say "бинарь и статика"
  install -m 755 "$root/dist/yuicry-api" /usr/local/bin/yuicry-api
  rm -rf /var/www/yuicry/*
  cp -a "$root/frontend/out/." /var/www/yuicry/

  say "systemd"
  install -m 644 "$here/yuicry-api.service" /etc/systemd/system/yuicry-api.service
  systemctl daemon-reload
  systemctl enable --now yuicry-api
  systemctl restart yuicry-api

  say "nginx"
  install -d /var/www/certbot
  if [ ! -f /etc/letsencrypt/live/yuicry.owaw.online/fullchain.pem ]; then
    cat > /etc/nginx/conf.d/yuicry-bootstrap.conf <<'EOF'
server {
    listen 80;
    server_name yuicry.owaw.online;
    root /var/www/certbot;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 404;
    }
}
EOF
    nginx -t
    systemctl reload nginx
    certbot certonly --webroot -w /var/www/certbot -d yuicry.owaw.online --non-interactive --agree-tos --register-unsafely-without-email
    rm -f /etc/nginx/conf.d/yuicry-bootstrap.conf
  fi

  install -m 644 "$here/nginx.conf" /etc/nginx/conf.d/yuicry.conf
  attach_haproxy
  nginx -t
  systemctl reload nginx

  say "готово"
  systemctl --no-pager --lines=0 status yuicry-api | head -5
}

deploy_storage() {
  say "пакеты"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates

  say "пользователь и каталоги"
  create_user

  if [ ! -f /etc/yuicry/storage.env ]; then
    cat > /etc/yuicry/storage.env <<'EOF'
STORAGE_ADDR=:10101
STORAGE_DIR=/var/lib/yuicry/cache
EOF
    chmod 600 /etc/yuicry/storage.env
  fi

  say "бинарь"
  install -m 755 "$root/dist/yuicry-storage" /usr/local/bin/yuicry-storage

  say "systemd"
  install -m 644 "$here/yuicry-storage.service" /etc/systemd/system/yuicry-storage.service
  systemctl daemon-reload
  systemctl enable --now yuicry-storage
  systemctl restart yuicry-storage

  if command -v ufw >/dev/null 2>&1; then
    ufw allow from 157.228.153.83 to any port 10101 proto tcp >/dev/null || true
  fi

  say "готово"
  systemctl --no-pager --lines=0 status yuicry-storage | head -5
}

case "$role" in
  api) deploy_api ;;
  storage) deploy_storage ;;
  *) printf 'usage: %s [api|storage]\n' "$0"; exit 1 ;;
esac
