# syntax=docker/dockerfile:1

# base image node LTS v22.4
FROM node:22.4-alpine3.19 AS build

# project root
ARG PROJECT_ROOT=/usr/src/app
WORKDIR $PROJECT_ROOT

# install pnpm
RUN npm install -g pnpm

# create directories
RUN mkdir shared
RUN mkdir frontend

# install shared dependencies
WORKDIR $PROJECT_ROOT/shared
COPY ./packages/shared/package.json ./packages/shared/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# install frontend dependencies
WORKDIR $PROJECT_ROOT/frontend
COPY ./packages/frontend/package.json ./packages/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# copy codebases
WORKDIR $PROJECT_ROOT
COPY ./packages/frontend ./frontend
COPY ./packages/shared ./shared

# build frontend
WORKDIR $PROJECT_ROOT/frontend
RUN pnpm run build


# base image caddy 2.8
FROM caddy:2.8-alpine

# copy built app
COPY --from=build /usr/src/app/frontend/dist /srv

# copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# expose port app runs on
EXPOSE 80
