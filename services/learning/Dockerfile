# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS builder
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/auth-kit/package.json packages/auth-kit/
COPY services/learning/package.json services/learning/

RUN pnpm install --frozen-lockfile --filter @innova/learning...

COPY packages/contracts packages/contracts
COPY packages/auth-kit packages/auth-kit
COPY services/learning services/learning

RUN pnpm --filter @innova/contracts build && \
    pnpm --filter @innova/auth-kit build && \
    pnpm --filter @innova/learning build

RUN pnpm --filter @innova/learning deploy --prod /prod/learning

FROM node:24.22.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder --chown=root:root /prod/learning ./

USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
