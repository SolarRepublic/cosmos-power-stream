FROM postgres:latest

ENV POSTGRES_DATABASE=wsm
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=cosmos

COPY init.sql /docker-entrypoint-initdb.d/

EXPOSE 5432
