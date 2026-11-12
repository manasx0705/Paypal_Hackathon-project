FROM node:20.18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20.18-alpine
ENV NODE_ENV=production TZ=Asia/Kolkata
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 CMD wget -qO- http://localhost:4000/api/v1/health || exit 1
CMD ["node", "src/index.js"]
