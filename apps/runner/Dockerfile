FROM node:18-bullseye

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY index.js worker.js ./
COPY adapters ./adapters
COPY utils ./utils

CMD ["npm", "start"]
