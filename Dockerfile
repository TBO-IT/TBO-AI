FROM node:22-slim
RUN apt-get update && apt-get install -y build-essential python3 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@8.6.12
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/api/package.json ./apps/
RUN pnpm install --prod=false
COPY . .
RUN pnpm run build:web && pnpm run build:api
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "start"]