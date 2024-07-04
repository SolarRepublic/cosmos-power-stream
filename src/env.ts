
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			POSTGRES_HOST?: string;
			POSTGRES_DATABASE?: string;
			POSTGRES_PORT?: string;
			POSTGRES_USER?: string;
			POSTGRES_PASSWORD?: string;
		}
	}
}
