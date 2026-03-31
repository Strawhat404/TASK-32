FROM node:22-alpine
WORKDIR /app

COPY package.json postcss.config.js tailwind.config.js vite.config.js index.html ./
COPY src ./src
RUN npm install

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
