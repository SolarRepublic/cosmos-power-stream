# base image node LTS v22.4
FROM node:22.4-alpine3.19

# project root
ARG PROJECT_ROOT=/usr/src/app
WORKDIR $PROJECT_ROOT

# install pnpm
RUN npm install -g pnpm

# make empty directories
RUN mkdir -p ./packages/backend
RUN mkdir -p ./packages/shared

# install shared dependencies
WORKDIR $PROJECT_ROOT/packages/shared
COPY ./packages/shared/package.json ./packages/shared/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# install backend dependencies
WORKDIR $PROJECT_ROOT/packages/backend
COPY ./packages/backend/package.json ./packages/backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# project root
WORKDIR $PROJECT_ROOT

# copy codebase into container
COPY . ./


# back to backend package
WORKDIR $PROJECT_ROOT/packages/backend

# build backend
RUN pnpm run build


# expose port app runs on
EXPOSE 3000


# # make executable
# RUN chmod u+x entrypoint.sh

# # set entrypoint
# ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

# command to run application
CMD ["npm", "run", "host"]

