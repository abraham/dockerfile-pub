RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1
FROM node:${NODE_VERSION}-alpine AS base
CMD ["node", "server.js"]
CMD ['node', 'server.js']
RUN echo it's here
RUN <<EOF
apt-get update
EOF
from node
FROMnode
ONBUILD RUN make
ENV NODE_ENV=production
COPY --chown="a b" src/ /app/
RUN echo $(date) $1 2>&1
