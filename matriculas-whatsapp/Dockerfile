# Build do front-end (Vite) + runtime do servidor Express (server/index.ts),
# que substitui as Serverless Functions + o Cron da Vercel no Azure App
# Service. Roda o TypeScript direto via tsx — sem passo de compilação
# separado pro servidor, só o build do Vite mesmo.

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# O Vite grava essas variáveis DENTRO do bundle na hora do build (não dá pra
# trocar depois só mudando env var do container em runtime) — precisam vir
# como build-arg no `docker build` ou na Action de deploy.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ZAPI_INSTANCE
ARG VITE_ZAPI_TOKEN
ARG VITE_ZAPI_CLIENT_TOKEN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ZAPI_INSTANCE=$VITE_ZAPI_INSTANCE \
    VITE_ZAPI_TOKEN=$VITE_ZAPI_TOKEN \
    VITE_ZAPI_CLIENT_TOKEN=$VITE_ZAPI_CLIENT_TOKEN
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx
COPY --from=build /app/dist ./dist
COPY api ./api
COPY server ./server

EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
