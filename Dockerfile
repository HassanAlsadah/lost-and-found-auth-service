# ============================================
# Factor 2: Dependencies — all bundled in image
# Factor 5: Build, Release, Run — this is the BUILD stage
# Factor 10: Dev/Prod Parity — same image everywhere
# ============================================

FROM node:20-alpine

WORKDIR /app

# Copy dependency declarations first (cache layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/

# Factor 7: Port Binding
EXPOSE 3001

# Factor 9: Disposability — run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Factor 11: Logs to stdout
ENV NODE_ENV=production
ENV LOG_LEVEL=info

CMD ["node", "src/server.js"]
