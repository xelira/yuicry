SHELL := /bin/bash

HOST ?= finland
VERSION ?= 1.5.0
REMOTE ?= /root/yuicry
PUBLIC ?= /var/www/yuicry

.PHONY: test test-backend test-frontend build api web apk release-apk deploy deploy-api deploy-web

test: test-backend test-frontend

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm test

build: api web

api:
	CGO_ENABLED=0 go build -C backend -trimpath -buildvcs=false -ldflags "-s -w -X main.Version=$(VERSION)" -o ../dist/yuicry-api .

web:
	cd frontend && npm run build

apk:
	cd frontend && npm run build && npx cap sync android
	cd frontend/android && ./gradlew assembleDebug

release-apk:
	cd frontend && npm run build && npx cap sync android
	cd frontend/android && set -a && source $$HOME/.yuicry/release.env && set +a && ./gradlew assembleRelease

deploy: test api web deploy-api deploy-web

deploy-api:
	rsync -az dist/yuicry-api $(HOST):$(REMOTE)/dist/
	ssh $(HOST) 'install -m 755 $(REMOTE)/dist/yuicry-api /usr/local/bin/yuicry-api && systemctl restart yuicry-api && sleep 1 && curl -fsS http://127.0.0.1:10000/api/health'

deploy-web:
	rsync -az --delete frontend/out/ $(HOST):$(REMOTE)/frontend/out/
	ssh $(HOST) 'rm -rf $(PUBLIC)/* && cp -a $(REMOTE)/frontend/out/. $(PUBLIC)/'
