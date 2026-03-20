FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY *.ts ./
COPY tsconfig.json ./
RUN npm run build

# Dossier persistant pour le token
VOLUME ["/app/data"]
ENV TOKEN_DIR=/app/data

USER node

ENTRYPOINT ["node", "dist/index.js"]
