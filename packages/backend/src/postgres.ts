import pg from 'pg';
const {Client} = pg;

export const Y_POSTGRES = new Client({
	host: process.env.POSTGRES_HOST || 'localhost',
	database: process.env.POSTGRES_DATABASE || 'cosmos_power_stream',
	port: parseInt(process.env.POSTGRES_PORT || '5432'),
	user: process.env.POSTGRES_USER || 'postgres',
	password: process.env.POSTGRES_PASSWORD || 'cosmos',
});

await Y_POSTGRES.connect();

export const psql_params = (c_params=0) => (): string => `$${++c_params}`;
