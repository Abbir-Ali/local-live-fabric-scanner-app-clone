#!/bin/bash

set -e

# Load environment variables
source .env 2>/dev/null || true
PORT=${PORT:-3040}

echo "Building project locally..."
npm run build

echo "Creating deployment package..."
tar --exclude='.git' --exclude='*.tar.gz' --exclude='*.zip' \
    --exclude='node_modules/.cache' --exclude='.next' --exclude='.nuxt' \
    --exclude='logs' --exclude='*.log' --exclude='.DS_Store' \
    --warning=no-file-changed \
    -czf tov-fabric-scanner-system.tar.gz .

echo "Deploying to server..."
scp tov-fabric-scanner-system.tar.gz ubuntu@3.17.97.82:/tmp/

ssh ubuntu@3.17.97.82 << EOF
# Stop existing service
sudo supervisorctl stop tov-fabric-scanner-system || true

# Kill any processes using port $PORT
sudo fuser -k $PORT/tcp || true
sleep 2

# Deploy code
cd /srv
# Backup database if it exists
if [ -f tov-fabric-scanner-system/prisma/dev.sqlite ]; then
    cp tov-fabric-scanner-system/prisma/dev.sqlite /tmp/dev.sqlite.backup
fi
sudo rm -rf tov-fabric-scanner-system
sudo mkdir -p tov-fabric-scanner-system
cd tov-fabric-scanner-system
sudo tar -xzf /tmp/tov-fabric-scanner-system.tar.gz
sudo chown -R ubuntu:ubuntu .
# Restore database if backup exists
if [ -f /tmp/dev.sqlite.backup ]; then
    cp /tmp/dev.sqlite.backup prisma/dev.sqlite
    rm /tmp/dev.sqlite.backup
fi

# Update supervisor configuration on each deployment
sudo tee /etc/supervisor/conf.d/tov-fabric-scanner-system.conf > /dev/null << 'SUPERVISOR_EOF'
[program:tov-fabric-scanner-system]
command=/home/ubuntu/.nvm/versions/node/v22.21.1/bin/npm run docker-start
directory=/srv/tov-fabric-scanner-system
autostart=true
autorestart=false
startsecs=5
stopasgroup=true
killasgroup=true
user=ubuntu
environment=NODE_ENV=production,PORT=$PORT,PATH="/home/ubuntu/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:/usr/bin:/bin"
stdout_logfile=/var/log/tov-fabric-scanner-system.log
stderr_logfile=/var/log/tov-fabric-scanner-system-error.log
SUPERVISOR_EOF
sudo supervisorctl reread
sudo supervisorctl update

# Start service
sudo supervisorctl start tov-fabric-scanner-system

# Cleanup
rm /tmp/tov-fabric-scanner-system.tar.gz
EOF

echo "Cleaning up local files..."
rm tov-fabric-scanner-system.tar.gz

echo "Deployment complete on port $PORT!"
