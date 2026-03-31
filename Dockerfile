FROM node:22-alpine AS build

WORKDIR /app

COPY . .
RUN npm ci
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist/spa /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
