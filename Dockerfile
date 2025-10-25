# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Create necessary directories
RUN mkdir -p logs data

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S wardenprime -u 1001

# Change ownership of the app directory
RUN chown -R wardenprime:nodejs /app

# Switch to non-root user
USER wardenprime

# Expose port (for dashboard if enabled)
EXPOSE 3080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD pgrep -f "node.*dist/index.js" || exit 1

# Start the bot
CMD ["npm", "start"]
