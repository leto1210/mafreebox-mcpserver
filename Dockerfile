FROM node:25-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY src ./src/
COPY tsconfig.json ./
RUN npm run build

# Production image
FROM node:25-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist/

# Set up persistent directory for tokens — owned by node before VOLUME is declared
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
ENV FREEBOX_TOKEN_FILE=/app/data/freebox_token.json

USER node

ENTRYPOINT ["node", "dist/index.js"]
