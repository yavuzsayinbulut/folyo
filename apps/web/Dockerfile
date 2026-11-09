# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# API adresi rewrite kurallarina derleme aninda yazilir (compose agindaki servis adi).
ARG API_URL=http://api:8080
ARG WEB_URL=https://folyo.app
ENV API_URL=$API_URL WEB_URL=$WEB_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Calisma: Next.js "standalone" ciktisi; node_modules'un yalniz gereken kismi, root olmayan kullanici.
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
