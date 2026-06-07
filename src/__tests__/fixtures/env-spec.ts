import { str, num, bool, port, url, email, host, json } from 'envalid';

export const envSpec = {
  DATABASE_URL: str({ desc: 'Postgres connection string' }),
  PORT: port({ default: 3000, desc: 'Server port' }),
  NODE_ENV: str({
    desc: 'Application environment',
    choices: ['development', 'test', 'production'],
    devDefault: 'development',
  }),
  DEBUG: bool({ desc: 'Enable debug logging', default: false }),
  API_URL: url({ desc: 'External API base URL' }),
  MAX_CONNECTIONS: num({ desc: 'Max database connections', default: 10 }),
  CONTACT_EMAIL: email({ desc: 'Contact email address' }),
  ALLOWED_HOST: host({ desc: 'Allowed host origin' }),
  FEATURE_FLAGS: json({ desc: 'Feature flag configuration' }),
};

// Also export without envalid-specific name — tests default export fallback
export default {
  LOG_LEVEL: str({ desc: 'Log verbosity', default: 'info' }),
};
