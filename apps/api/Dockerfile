FROM node:20-slim
WORKDIR /app
RUN npm install -g tsx
COPY package*.json ./
RUN npm install
COPY . .
CMD ["tsx", "src/index.ts"]
