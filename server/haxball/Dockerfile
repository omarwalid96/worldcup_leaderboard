# Fly builds this from the REPO ROOT (fly.toml sets dockerfile + a root context)
# so the server can import the shared src/lib/games/haxball/world.ts.
FROM node:20-slim
WORKDIR /app

# Server deps only (includes planck for the physics).
COPY server/haxball/package.json ./server/haxball/package.json
RUN cd server/haxball && npm install --omit=dev

# The server + the shared planck world it imports (../../src/lib/games/haxball/world.ts).
COPY server/haxball/index.ts ./server/haxball/index.ts
COPY src/lib/games/haxball/world.ts ./src/lib/games/haxball/world.ts

ENV PORT=8080
EXPOSE 8080
WORKDIR /app/server/haxball
CMD ["npx", "tsx", "index.ts"]
