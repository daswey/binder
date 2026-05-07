FROM node:20-slim AS base
WORKDIR /app
RUN npm install -g tsx

COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN cd apps/api && npm install

COPY packages/ packages/
COPY apps/api/ apps/api/

WORKDIR /app/apps/api
CMD ["tsx", "src/index.ts"]
