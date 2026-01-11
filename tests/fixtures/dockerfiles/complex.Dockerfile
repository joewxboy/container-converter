# Multi-stage build example
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
LABEL maintainer="test@example.com"
LABEL version="1.0.0"

ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL debug

WORKDIR /app
USER node

COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN npm ci --only=production

EXPOSE 3000
EXPOSE 9090/tcp

VOLUME ["/app/data", "/app/logs"]

ENTRYPOINT ["node"]
CMD ["dist/index.js"]