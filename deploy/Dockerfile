# syntax=docker/dockerfile:1

FROM node:20-alpine AS web
WORKDIR /src
COPY . /src
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @actilens/web-admin build

FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY apps/backend /src
RUN go mod download
ARG VERSION=0.1.0
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags "-s -w -X actilens/backend/internal/handlers.Version=${VERSION}" -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 app
WORKDIR /app
COPY --from=backend /out/server /app/server
COPY --from=web /src/apps/web-admin/dist /app/static/admin
COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN mkdir -p /app/storage/screenshots /app/config /app/logs /app/static && printf '<!doctype html><meta http-equiv="refresh" content="0;url=/admin/">' > /app/static/index.html && chown -R app:app /app && chmod +x /app/docker-entrypoint.sh
USER app
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
