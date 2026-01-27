# Go microservice with multi-stage build
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/service ./cmd/service

# Final image
FROM alpine:3.18

LABEL maintainer="dev@example.com"
LABEL version="3.0.0"
LABEL service.name="golang-edge-service"

RUN apk add --no-cache ca-certificates tzdata

ENV TZ=UTC
ENV SERVICE_PORT=9000
ENV LOG_FORMAT=json
ENV METRICS_PORT=9001

WORKDIR /app

COPY --from=builder /bin/service /app/service

RUN addgroup -g 1000 app && \
    adduser -u 1000 -G app -s /bin/sh -D app
USER app

EXPOSE 9000
EXPOSE 9001

VOLUME ["/app/config"]

ENTRYPOINT ["/app/service"]
CMD ["--config", "/app/config/config.yaml"]
