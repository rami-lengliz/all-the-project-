FROM node:20-slim AS development
# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps
COPY . .
RUN npx prisma@5 generate
RUN npm run build

FROM node:20-slim AS production
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --only=production --legacy-peer-deps && npm cache clean --force
RUN npx prisma@5 generate
COPY --from=development /usr/src/app/dist ./dist
CMD ["sh", "-c", "npx prisma@5 migrate deploy && node dist/src/main.js"]