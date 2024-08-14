#!/bin/bash
pushd ./packages/backend/database/postgres
	docker build -t solar-republic/cosmos-power-stream-db-postgres .
popd

docker build -t solar-republic/cosmos-power-stream-ui -f frontend.Dockerfile .
docker build -t solar-republic/cosmos-power-stream-app -f app.Dockerfile .
