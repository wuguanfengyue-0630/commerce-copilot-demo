FROM node:24.14.1-bookworm-slim

WORKDIR /app

RUN npm install --global pnpm@11.7.0

COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "start:public"]
