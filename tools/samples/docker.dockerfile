# syntax=docker/dockerfile:1
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS build
LABEL maintainer="me" version="1.0"
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci && \
    npm run build
COPY --from=build /app/dist /srv
EXPOSE 3000/tcp
HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/ || exit 1
USER node
ENTRYPOINT ["node", "server.js"]
CMD ["--port", "3000"]
