# Stage 1: build frontend
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY ../frontend/package*.json ./
RUN npm ci
COPY ../frontend ./
RUN npm run build

# Stage 2: backend
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=frontend /frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
