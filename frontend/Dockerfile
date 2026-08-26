FROM node:20-bookworm-slim AS dependencies

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder

WORKDIR /app/frontend

ARG NEXT_PUBLIC_CVFUZZ_API_URL=/api
ARG CVFUZZ_API_INTERNAL_URL=http://backend:8020
ENV NEXT_PUBLIC_CVFUZZ_API_URL=$NEXT_PUBLIC_CVFUZZ_API_URL \
    CVFUZZ_API_INTERNAL_URL=$CVFUZZ_API_INTERNAL_URL

COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3010 \
    HOSTNAME=0.0.0.0

WORKDIR /app

RUN groupadd --gid 10001 cvfuzz \
    && useradd --uid 10001 --gid cvfuzz --create-home --shell /usr/sbin/nologin cvfuzz

COPY --from=builder --chown=cvfuzz:cvfuzz /app/frontend/.next/standalone ./
COPY --from=builder --chown=cvfuzz:cvfuzz /app/frontend/public ./frontend/public
COPY --from=builder --chown=cvfuzz:cvfuzz /app/frontend/.next/static ./frontend/.next/static

USER cvfuzz

WORKDIR /app/frontend

EXPOSE 3010

CMD ["node", "server.js"]
