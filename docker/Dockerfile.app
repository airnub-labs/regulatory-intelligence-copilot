FROM node:24-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /workspace

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/auditor-core/package.json ./packages/auditor-core/
COPY packages/sample-api/package.json ./packages/sample-api/

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Build packages
RUN pnpm build

# Expose port
EXPOSE 3000

# Default command
CMD ["pnpm", "dev"]
