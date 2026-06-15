FROM node:26-slim

RUN npm install -g pnpm

RUN pnpm install -g pnpm@11.6.0

WORKDIR /app

ENV PORT=3000

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "pnpm install && pnpm build && pnpm start"]
