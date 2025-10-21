// PM2 ecosystem configuration for production deployment
module.exports = {
  apps: [{
    name: 'md-converter',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '500M',
    watch: false,
    ignore_watch: ['node_modules', 'uploads', 'logs', 'public'],
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true
  }]
};
