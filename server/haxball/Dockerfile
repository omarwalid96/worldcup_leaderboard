# Built from the REPO ROOT (build context = root) so the server can import the
# shared src/lib/games/haxball/world.ts and its deps.
FROM node:20-slim
WORKDIR /app

# Install deps at /app root (NOT under server/haxball) so node_modules lives at
# /app/node_modules. Node walks up the tree for node_modules, so BOTH the server
# (/app/server/haxball/index.ts) AND the copied world (/app/src/.../world.ts)
# resolve `planck`, `ws`, `postgres` from there.
COPY server/haxball/package.json ./package.json
RUN npm install --omit=dev

# The server + the shared planck world it imports.
COPY server/haxball/index.ts ./server/haxball/index.ts
COPY src/lib/games/haxball/world.ts ./src/lib/games/haxball/world.ts

ENV PORT=8080
EXPOSE 8080
WORKDIR /app/server/haxball
CMD ["npx", "tsx", "index.ts"]
