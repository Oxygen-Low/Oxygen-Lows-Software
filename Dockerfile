# Use a lightweight Node.js Alpine image
FROM node:26-slim

# Install pnpm
RUN npm install -g pnpm@10.14.0

# Set the working directory
WORKDIR /app

# Set the PORT environment variable
ENV PORT=3000

# Copy all application code
# We don't install or build here to keep the image small
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Install dependencies, build, and start the application at runtime
CMD ["sh", "-c", "pnpm install && pnpm build && pnpm start"]
