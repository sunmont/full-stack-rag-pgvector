FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

# Expose Next.js dev server port
EXPOSE 3000

# Run Next.js in development mode
CMD ["npm", "run", "dev"]