FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY tests ./tests

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@kansha/api", "start"]
