FROM node:22-bookworm-slim

# ca-certificates: sem ele o login do Codex falha com "error sending request".
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global @anthropic-ai/claude-code @openai/codex \
    && npm cache clean --force

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=8787 \
    HOME=/data \
    CLAUDE_CONFIG_DIR=/data/.claude \
    CODEX_HOME=/data/.codex

VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "src/index.js"]

