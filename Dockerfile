FROM node:20-alpine

WORKDIR /app

# ── Frontend build ─────────────────────────────────────────────────────────────
COPY sentinel/frontend/package.json ./sentinel/frontend/
RUN cd sentinel/frontend && npm install
COPY sentinel/frontend/ ./sentinel/frontend/
RUN cd sentinel/frontend && npx vite build

# ── Server install ─────────────────────────────────────────────────────────────
COPY sentinel/server/package.json ./sentinel/server/
RUN cd sentinel/server && npm install --omit=dev
COPY sentinel/server/ ./sentinel/server/

EXPOSE 3005

WORKDIR /app/sentinel/server
CMD ["node", "index.js"]
