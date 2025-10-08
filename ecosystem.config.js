module.exports = {
  apps: [
    {
      name: 'korptair-bot',
      script: './dist/index.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
        WATCH: true,
        script: './node_modules/.bin/ts-node',
        args: 'src/dev.ts'
      },
      max_memory_restart: '1536M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      
      restart_delay: 5000,
      min_uptime: 30000,
      max_restarts: 5,
      exp_backoff_restart_delay: 100,
      
      kill_timeout: 3000,
      stop_exit_codes: [0],
    },
  ],
}; 