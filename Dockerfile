FROM node:26-slim@sha256:deae974a69e140f44f434ab29cb519fb5f8fe250fd364b8ca446bd0761acdc6a

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest && npm install -g pnpm

WORKDIR /app

ENV PORT=3000

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "pnpm install && pnpm build && pnpm start"]
