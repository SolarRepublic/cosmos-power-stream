#!/bin/sh
POSTGRES_HOST=${POSTGRES_HOST:-localhost}
POSTGRES_USER=${POSTGRES_USER:-postgres}
# POSTGRES_DATABASE=${POSTGRES_DATABASE:-wsm}
psql -h $POSTGRES_HOST -U $POSTGRES_USER -f wsm.sql
