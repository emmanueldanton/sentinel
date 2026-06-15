FROM node:20-alpine

WORKDIR /app

# Copy server package files and install dependencies
COPY sentinel/server/package.json sentinel/server/package-lock.json ./sentinel/server/
RUN cd sentinel/server && npm ci --production

# Copy server source code
COPY sentinel/server/ ./sentinel/server/

# Copy pre-built frontend dist
COPY sentinel/frontend/dist/ ./sentinel/frontend/dist/

EXPOSE 3005

WORKDIR /app/sentinel/server
CMD ["node", "index.js"]
