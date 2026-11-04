FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dev
RUN apk add --no-cache git python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages packages
COPY apps apps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN pnpm install --frozen-lockfile
# Prisma generate
RUN pnpm api prisma generate
EXPOSE 4000
CMD ["pnpm", "api", "dev"]
