# Built from the repository root — the install reads the workspace lockfile.
FROM node:22-alpine AS build

WORKDIR /repo
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter @media-studio/frontend
RUN pnpm --filter @media-studio/frontend run build

FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app
# Nitro bundles the server with its dependencies, so there is nothing to install here.
COPY --from=build /repo/frontend/.output ./

EXPOSE 3000

CMD ["node", "server/index.mjs"]
