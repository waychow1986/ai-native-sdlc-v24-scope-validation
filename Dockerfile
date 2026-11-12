FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build

FROM node:24-bookworm-slim AS production

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATUS_MODE=success
WORKDIR /app
COPY --from=builder /app/dist/package.json /app/dist/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist/src ./src
COPY --from=builder --chown=node:node /app/dist/public ./public
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
