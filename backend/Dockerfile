FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/prisma/ prisma/
RUN npx prisma generate

# Prune dev deps after generate (prisma CLI is a devDep)
RUN npm prune --omit=dev

COPY backend/ .

EXPOSE 8001
CMD ["node", "run.js"]
