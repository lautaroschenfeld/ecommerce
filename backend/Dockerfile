FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 9000
CMD ["node", "dist/server.js"]
