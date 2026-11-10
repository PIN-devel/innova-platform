# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS builder
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/auth-kit/package.json packages/auth-kit/
COPY services/finance/package.json services/finance/

RUN pnpm install --frozen-lockfile --filter @innova/finance...

COPY packages/contracts packages/contracts
COPY packages/auth-kit packages/auth-kit
COPY services/finance services/finance

RUN pnpm --filter @innova/contracts build && \
    pnpm --filter @innova/auth-kit build && \
    pnpm --filter @innova/finance build

RUN pnpm --filter @innova/finance deploy --prod /prod/finance

FROM node:24.22.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder --chown=root:root /prod/finance ./

USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
