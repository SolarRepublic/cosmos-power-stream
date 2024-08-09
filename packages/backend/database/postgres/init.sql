CREATE DATABASE wsm;

\c wsm;

-- stores data about each individual transaction
CREATE TABLE transactions(
	id BIGSERIAL PRIMARY KEY,
	height BIGINT NOT NULL,
	tx_bytes BYTEA NOT NULL,
	tx_data BYTEA NOT NULL,
	timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- stores all distinct paths of an event. composition of "{type}.{key}"
CREATE TABLE event_paths(
	id BIGSERIAL PRIMARY KEY,
	path_text TEXT UNIQUE NOT NULL
);

-- stores all distinct values of an event, indexed by various datatypes
CREATE TABLE event_values(
	id BIGSERIAL PRIMARY KEY,
	value_hash TEXT UNIQUE NOT NULL,
	value_bigint DECIMAL,
	value_unit VARCHAR(128),
	value_text TEXT,
	value_bytes BYTEA
);

-- associates transactions to their events
CREATE TABLE events(
	tx_id BIGINT REFERENCES transactions(id) ON DELETE CASCADE,
	path_id BIGINT REFERENCES event_paths(id) ON DELETE CASCADE,
	value_id BIGINT REFERENCES event_values(id) ON DELETE CASCADE
);

-- index transactions by internal serial ID
CREATE INDEX idx_tx_id ON transactions(id);

-- index transactions by block height
CREATE INDEX idx_tx_height ON transactions(height);

-- index event paths
CREATE INDEX idx_event_path on event_paths using BTREE(path_text);

-- index event values across its various datatypes
CREATE INDEX idx_event_value_hash ON event_values(value_hash);
CREATE INDEX idx_event_value_bigint ON event_values(value_bigint);
CREATE INDEX idx_event_value_unit ON event_values(value_unit);
CREATE INDEX idx_event_value_text ON event_values(value_text);
CREATE INDEX idx_event_value_bytes ON event_values USING HASH(value_bytes);

-- index events table by each of its columns
CREATE INDEX idx_event_tx_id ON events(tx_id);
CREATE INDEX idx_event_path_id ON events(path_id);
CREATE INDEX idx_event_value_id ON events(value_id);


-- parameterizes the creation of filter functions
CREATE OR REPLACE FUNCTION create_filter_func(
	symbol TEXT,
	params TEXT,
	outputs TEXT,
	selection TEXT,
	inject TEXT
) RETURNS VOID AS $body$
BEGIN
	EXECUTE format($func$
		CREATE OR REPLACE FUNCTION %I(
			_path_text TEXT,
			%s
		) RETURNS TABLE (
			tx_id BIGINT,
			%s
		) AS $query$
			BEGIN
				RETURN QUERY
				SELECT e.tx_id, %s
				FROM events e
				INNER JOIN event_paths p ON e.path_id = p.id
				INNER JOIN event_values v ON e.value_id = v.id
				WHERE
					p.path_text = _path_text
					AND %s ;
			END;
		$query$ LANGUAGE plpgsql STABLE PARALLEL SAFE;
	$func$, symbol, params, outputs, selection, inject);
END;
$body$ LANGUAGE plpgsql;

-- parameterizes the creation of inequality filters for events
CREATE OR REPLACE FUNCTION create_filter_func_inequality(
	symbol TEXT,
	operator TEXT
) RETURNS VOID AS $body$
BEGIN
	PERFORM create_filter_func(
		symbol,
		params => $$
			_value_bigint DECIMAL,
			_value_unit VARCHAR(128) DEFAULT NULL
		$$,
		outputs => $$
			value_text TEXT,
			value_bigint DECIMAL
		$$,
		selection => $$
			v.value_text,
			v.value_bigint
		$$,
		inject => format($$
			v.value_bigint %s _value_bigint
			AND (CASE
				WHEN _value_unit IS NULL THEN v.value_unit IS NULL
				ELSE v.value_unit = _value_unit
			END)
		$$, operator)
	);
END;
$body$ LANGUAGE plpgsql;

-- parameterizes the creation of text-based equality filters for events
CREATE OR REPLACE FUNCTION create_filter_func_text_equality(
	symbol TEXT,
	operator TEXT
) RETURNS VOID AS $body$
BEGIN
	PERFORM create_filter_func(
		symbol,
		params => '_value_text TEXT',
		outputs => 'value_text TEXT',
		selection => 'v.value_text',
		inject => format('v.value_text %s _value_text', operator)
	);
END;
$body$ LANGUAGE plpgsql;

-- parameterizes the creation of hash-based equality filters for events
CREATE OR REPLACE FUNCTION create_filter_func_hash_equality(
	symbol TEXT,
	operator TEXT
) RETURNS VOID AS $body$
BEGIN
	PERFORM create_filter_func(
		symbol,
		params => '_value_hash TEXT',
		outputs => 'value_bytes TEXT',
		selection => 'v.value_bytes',
		inject => format('v.value_hash %s _value_hash', operator)
	);
END;
$body$ LANGUAGE plpgsql;

-- event filter function for 'exists' operation
SELECT create_filter_func(
	symbol => 'filter_event_path_exists',
	params => '_ignore TEXT',
	outputs => 'path_text TEXT',
	selection => 'p.path_text',
	inject => 'TRUE',
);

-- -- event filter function for 'not exists' operation
-- CREATE OR REPLACE FUNCTION filter_func_path_not_exists(
-- 	_path_text TEXT
-- ) RETURNS TABLE (
-- 	tx_id BIGINT
-- ) AS $query$
-- 	BEGIN
-- 		RETURN QUERY
-- 		SELECT e.tx_id
-- 		FROM events e
-- 		INNER JOIN event_paths p on e.path_id = p.id
-- 		WHERE
-- 			p.path_text 
-- 	END;
-- $query$ LANGUAGE plpgsql STABLE PARALLEL SAFE;

-- generate an event filter function for each inequality type
SELECT create_filter_func_inequality('filter_event_quantity_lt', '<');
SELECT create_filter_func_inequality('filter_event_quantity_gt', '>');
SELECT create_filter_func_inequality('filter_event_quantity_lte', '<=');
SELECT create_filter_func_inequality('filter_event_quantity_gte', '>=');

-- generate an event filter function for text-based equality
SELECT create_filter_func_text_equality('filter_event_text_eq', '=');
SELECT create_filter_func_text_equality('filter_event_text_neq', '!=');

-- generate an event filter function for hash-based equality
SELECT create_filter_func_hash_equality('filter_event_hash_eq', '=');
SELECT create_filter_func_hash_equality('filter_event_hash_neq', '!=');


-- selects all the events for the given list of transaction IDs
CREATE OR REPLACE FUNCTION events_for_transactions(
	_tx_ids BIGINT[]
) RETURNS TABLE (
	tx_id BIGINT,
	path_text TEXT,
	value_text TEXT,
	value_bytes BYTEA
) AS $body$
BEGIN
	RETURN QUERY
	SELECT e.tx_id, p.path_text, v.value_text, v.value_bytes
	FROM events e
	INNER JOIN event_paths p on p.id = e.path_id
	INNER JOIN event_values v on v.id = e.value_id
	WHERE e.tx_id = ANY(_tx_ids);
END;
$body$ LANGUAGE plpgsql;
