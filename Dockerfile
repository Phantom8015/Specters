
FROM node:18-alpine


WORKDIR /app


RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git


COPY package*.json ./


RUN npm ci --only=production


COPY . .


RUN addgroup -g 1001 -S nodejs && \
    adduser -S specters -u 1001 -G nodejs


RUN chown -R specters:nodejs /app


USER specters


EXPOSE 3000


ENV NODE_ENV=production
ENV PORT=3000


HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"


CMD ["npm", "start"]
