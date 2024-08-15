#!/bin/bash
psql $@ -f ./packages/backend/database/postgres/init.sql
