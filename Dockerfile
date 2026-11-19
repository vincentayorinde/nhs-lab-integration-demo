FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY api ./api
COPY docs ./docs
EXPOSE 8080
CMD ["node", "api/server.mjs"]