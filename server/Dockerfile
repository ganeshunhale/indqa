# IndQA backend (Express + Socket.IO)
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "app.js"]
