# syntax=docker/dockerfile:1

FROM postgres:latest

ENV POSTGRES_DATABASE=cosmos_power_stream
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=cosmos

COPY init.sql /docker-entrypoint-initdb.d/

EXPOSE 5432
