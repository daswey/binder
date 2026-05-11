FROM node:20-slim
WORKDIR /app
RUN npm install -g tsx
COPY apps/api/package*.json ./
RUN npm install
COPY apps/api/ .
CMD ["tsx", "src/index.ts"]
