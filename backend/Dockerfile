# Built from the repository root — the install reads the workspace lockfile.
FROM node:22-alpine AS build

WORKDIR /repo
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter @media-studio/backend
RUN pnpm --filter @media-studio/backend run build
# The production dependency tree, self-contained: no symlinks out of the directory.
RUN pnpm --filter @media-studio/backend deploy --legacy --prod /deps

FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app
COPY --from=build /deps/node_modules ./node_modules
COPY --from=build /repo/backend/package.json ./
COPY --from=build /repo/backend/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main"]
