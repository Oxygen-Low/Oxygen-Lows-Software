FROM ubuntu:latest

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash && \. "$HOME/.nvm/nvm.sh" && nvm install 26

RUN npm install -g pnpm@11.5.2

WORKDIR /app

ENV PORT=3000

COPY . .

RUN useradd -m appuser && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "pnpm install && pnpm build && pnpm start"]
