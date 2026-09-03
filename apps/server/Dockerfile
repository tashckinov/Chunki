# Build context is the repo root (this is an npm-workspaces monorepo, so the
# server can't be built in isolation) — see docker-compose.yml's `build.context`.
#
#   docker build -f apps/server/Dockerfile -t chunki-backend .

FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

FROM base AS build
RUN npm ci
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w packages/shared
RUN npm run build -w apps/server

FROM base AS runtime
ENV NODE_ENV=production
# Only the workspaces the backend actually needs at runtime — apps/web's
# (unrelated) dependencies never end up in this image.
RUN npm ci --omit=dev --workspace=apps/server --workspace=packages/shared

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/migrations apps/server/migrations

EXPOSE 8787
CMD ["node", "apps/server/dist/index.js"]
