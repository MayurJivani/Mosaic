# Mosaic — one image, one process, one origin.
# The relay serves the built board and overlay and runs the WebSocket, so there
# is no second service to deploy and no cross-origin cookie problem.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Only the relay's own dependency (ws) is needed at runtime; the board and the
# overlay ship as static files in dist/.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

# Uploaded clips, images and sounds. Mount a volume here or a redeploy wipes
# every mod's clip library.
RUN mkdir -p /app/uploads && chown -R node:node /app
VOLUME ["/app/uploads"]

USER node
EXPOSE 4322
ENV MOSAIC_PORT=4322

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MOSAIC_PORT||4322)+'/net').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
