FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --include-workspace-root

COPY server server
RUN npm --workspace server run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --include-workspace-root && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY server/data server/data

WORKDIR /app/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
