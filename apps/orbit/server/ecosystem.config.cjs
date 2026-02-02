module.exports = {
  apps: [
    {
      name: 'orbit-server',
      script: 'bun',
      args: 'run src/index.ts',
      cwd: __dirname,
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_PATH: './data/orbit.db',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: '3001',
        DATABASE_PATH: './data/orbit.dev.db',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
