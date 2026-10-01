// PM2:  pm2 start deploy/ecosystem.config.js && pm2 save
// Build first:  npm run build   (backend -> backend/dist, frontend -> frontend/.next)
module.exports = {
  apps: [
    { name: 'transit-api', cwd: './backend', script: 'dist/backend/src/app.js', env: { NODE_ENV: 'production' }, env_file: '.env' },
    { name: 'transit-web', cwd: './frontend', script: 'node_modules/next/dist/bin/next', args: 'start -p 3000', env: { NODE_ENV: 'production' } },
  ],
};
