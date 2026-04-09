# Stage 1: build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline || npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend + frontend static
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev --prefer-offline || npm ci --omit=dev
COPY backend/src ./src
COPY --from=frontend-builder /frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
