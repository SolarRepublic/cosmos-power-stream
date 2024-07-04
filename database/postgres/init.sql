CREATE DATABASE wsm;

\c wsm;

-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE transactions(
	id BIGSERIAL PRIMARY KEY,
	height BIGINT NOT NULL,
	tx_bytes BYTEA NOT NULL,
	tx_result JSONB NOT NULL,
	timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_paths(
	id BIGSERIAL PRIMARY KEY,
	path_text TEXT UNIQUE NOT NULL
);

CREATE TABLE event_values(
	id BIGSERIAL PRIMARY KEY,
	value_hash TEXT UNIQUE NOT NULL,
	value_bytes BYTEA NOT NULL
);

CREATE TABLE events(
	tx_id BIGINT REFERENCES transactions(id) ON DELETE CASCADE,
	path_id BIGINT REFERENCES event_paths(id) ON DELETE CASCADE,
	value_id BIGINT REFERENCES event_values(id) ON DELETE CASCADE
);

CREATE INDEX idx_tx_id ON transactions(id);
CREATE INDEX idx_tx_height ON transactions(height);
CREATE INDEX idx_event_path on event_paths(path_text);
CREATE INDEX idx_event_value ON event_values(value_hash);

CREATE INDEX idx_event_tx_id ON events(tx_id);
CREATE INDEX idx_event_path_id ON events(path_id);
CREATE INDEX idx_event_value_id ON events(value_id);


-- CREATE TABLE events (
-- 	-- id SERIAL PRIMARY KEY,
-- 	tx_id INT REFERENCES transactions(id) ON DELETE CASCADE,
-- 	event_path TEXT NOT NULL,
-- 	event_value TEXT NOT NULL
-- 	-- CONSTRAINT events_unique UNIQUE (tx_id, event_path, event_value)
-- );

-- CREATE INDEX idx_event_tx_id ON events(tx_id);
-- CREATE INDEX idx_event_path ON events(event_path);
-- -- CREATE INDEX idx_event_value ON events USING GIN(event_value);
-- CREATE INDEX idx_event_value ON events USING GIN(event_value gin_trgm_ops);
-- -- CREATE INDEX idx_event_value ON events USING GIN(indexed_event_value);

-- -- CREATE OR REPLACE FUNCTION update_indexed_event_value()
-- -- RETURNS TRIGGER AS $$
-- -- BEGIN
-- -- 	NEW.indexed_event_value := to_tsvector('english', NEW.event_value);
-- -- 	RETURN NEW;
-- -- END;
-- -- $$ LANGUAGE plpgsql;

-- -- CREATE TRIGGER trg_update_indexed_event_value
-- -- BEFORE INSERT OR UPDATE ON events
-- -- FOR EACH ROW EXECUTE FUNCTION update_indexed_event_value();

