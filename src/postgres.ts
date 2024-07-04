import {Client} from 'pg';

export const Y_POSTGRES = new Client({
	host: process.env.POSTGRES_HOST || 'localhost',
	database: process.env.POSTGRES_DATABASE || 'wsm',
	port: parseInt(process.env.POSTGRES_PORT || '5432'),
	user: process.env.POSTGRES_USER || 'postgres',
	password: process.env.POSTGRES_PASSWORD || 'cosmos',
});

await Y_POSTGRES.connect();

