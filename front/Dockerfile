FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist/bside ./dist/bside
EXPOSE 4000
CMD ["node", "dist/bside/server/server.mjs"]
