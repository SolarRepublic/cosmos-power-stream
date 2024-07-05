CREATE DATABASE wsm;

\c wsm;

CREATE TABLE transactions(
	id BIGSERIAL PRIMARY KEY,
	height BIGINT NOT NULL,
	tx_bytes BYTEA NOT NULL,
	tx_result BYTEA NOT NULL,
	timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_paths(
	id BIGSERIAL PRIMARY KEY,
	path_text TEXT UNIQUE NOT NULL
);

CREATE TABLE event_values(
	id BIGSERIAL PRIMARY KEY,
	value_hash TEXT UNIQUE NOT NULL,
	value_bigint DECIMAL,
	value_unit VARCHAR(128),
	value_text TEXT,
	value_bytes BYTEA
);

CREATE TABLE events(
	tx_id BIGINT REFERENCES transactions(id) ON DELETE CASCADE,
	path_id BIGINT REFERENCES event_paths(id) ON DELETE CASCADE,
	value_id BIGINT REFERENCES event_values(id) ON DELETE CASCADE
);

CREATE INDEX idx_tx_id ON transactions(id);
CREATE INDEX idx_tx_height ON transactions(height);
CREATE INDEX idx_event_path on event_paths(path_text);
CREATE INDEX idx_event_value_hash ON event_values USING BTREE(value_hash);
CREATE INDEX idx_event_value_bigint ON event_values(value_bigint);
CREATE INDEX idx_event_value_unit ON event_values(value_unit);
CREATE INDEX idx_event_value_text ON event_values(value_text);
CREATE INDEX idx_event_value_bytes ON event_values USING HASH(value_bytes);

CREATE INDEX idx_event_tx_id ON events(tx_id);
CREATE INDEX idx_event_path_id ON events(path_id);
CREATE INDEX idx_event_value_id ON events(value_id);
