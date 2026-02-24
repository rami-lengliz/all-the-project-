FROM node:20-slim AS development
# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS production
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --only=production && npm cache clean --force
RUN npx prisma generate
COPY --from=development /usr/src/app/dist ./dist
CMD ["node", "dist/main"]

