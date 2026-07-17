# Backend API container — Allied KCC (Node 20 + Express).
# Build context is the REPO ROOT (see docker-compose.prod.yml).
# On start it runs pending DB migrations, then launches the API.
FROM node:20-bookworm

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json .sequelizerc ./
RUN npm ci

# App code + migrations + the demo-seed script.
COPY backend ./backend
COPY migrations ./migrations
COPY scripts ./scripts

# Filedrop working dirs (ERP CSV inbox/outbox/archive) live on a mounted volume.
RUN mkdir -p data/erp/inbox data/erp/outbox data/erp/archive

EXPOSE 3000

# Apply any new migrations, then start the server.
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node backend/src/app.js"]
