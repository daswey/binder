FROM node:20-slim AS build
WORKDIR /app

COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN cd apps/web && npm install

COPY packages/ packages/
COPY apps/web/ apps/web/

WORKDIR /app/apps/web
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
