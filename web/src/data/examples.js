/** @type {Record<string, { label: string; description: string; content: string }>} */
export const EXAMPLES = {
  simple: {
    label: 'Simple',
    description: 'A minimal Node.js web server image',
    content: `FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "server.js"]`,
  },

  average: {
    label: 'Average',
    description: 'A multi-stage build producing a lean Nginx image',
    content: `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist .
EXPOSE 80
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]`,
  },

  complex: {
    label: 'Complex',
    description: 'Production-grade multi-stage build with caching, security, and health checks',
    content: `# syntax=docker/dockerfile:1
ARG NODE_VERSION=18
FROM node:\${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \\
    npm ci --omit=dev

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \\
    CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["node"]
CMD ["dist/server.js"]`,
  },
};
