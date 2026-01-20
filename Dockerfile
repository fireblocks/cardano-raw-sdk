FROM node:20-alpine AS build

WORKDIR /usr/src/app


COPY package*.json ./
RUN npm ci --strict-ssl=false

COPY . .
# COPY .env .
RUN npx tsc

# Stage 2: production
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy only compiled files + dependencies
COPY package*.json ./
RUN npm ci --omit=dev --strict-ssl=false

COPY --from=build /usr/src/app/dist ./dist

# COPY --from=build /usr/src/app/.env ./
# COPY ./secrets ./secrets

EXPOSE 8000

CMD ["node", "dist/app.js"]