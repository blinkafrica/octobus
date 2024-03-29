##########
## DEVELOPMENT ##
##########
FROM node:20-alpine AS development

WORKDIR /usr/src/app

COPY package*.json ./

RUN yarn install

COPY . .

RUN yarn build

##########
## PRODUCTION ##
##########

FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package*.json ./

RUN yarn install

COPY . .

COPY --from=development /usr/src/app/dist ./dist

EXPOSE 8080

CMD [ "npm", "run", "start:migrate:prod" ]