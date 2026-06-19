# Fly builds this from the REPO ROOT (fly.toml sets dockerfile + a root context)
# so the server can import the shared src/lib/games/haxball/physics.ts.
FROM node:20-slim
WORKDIR /app

# Server deps only.
COPY server/haxball/package.json ./server/haxball/package.json
RUN cd server/haxball && npm install --omit=dev

# The server + the shared physics it imports (../../src/lib/games/haxball/physics.ts).
COPY server/haxball/index.ts ./server/haxball/index.ts
COPY src/lib/games/haxball/physics.ts ./src/lib/games/haxball/physics.ts

ENV PORT=8080
EXPOSE 8080
WORKDIR /app/server/haxball
CMD ["npx", "tsx", "index.ts"]
