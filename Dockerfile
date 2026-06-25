FROM node:26-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

ENV PORT=3000

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "pnpm install && pnpm build && pnpm start"]
