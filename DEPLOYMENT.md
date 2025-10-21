# Deployment Guide - Markdown Converter

## Production Build

### 1. Build for Production

```bash
# Build minified CSS
npm run build

# Or use the combined build and run command
npm run prod
```

## Deployment Options

### Option 1: Traditional Node.js Deployment

#### Prerequisites
- Node.js 18+ installed
- PM2 for process management (recommended)

#### Steps

1. **Install PM2 globally**
```bash
npm install -g pm2
```

2. **Build the application**
```bash
npm run build
```

3. **Start with PM2**
```bash
# Start the application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

4. **PM2 Management Commands**
```bash
# View logs
pm2 logs md-converter

# Monitor
pm2 monit

# Restart
pm2 restart md-converter

# Stop
pm2 stop md-converter

# View status
pm2 status
```

### Option 2: Docker Deployment

#### Prerequisites
- Docker installed
- Docker Compose (optional)

#### Using Docker Compose (Recommended)

1. **Build and start**
```bash
docker-compose up -d
```

2. **View logs**
```bash
docker-compose logs -f
```

3. **Stop the container**
```bash
docker-compose down
```

4. **Rebuild after changes**
```bash
docker-compose up -d --build
```

#### Using Docker directly

1. **Build the image**
```bash
docker build -t md-converter:latest .
```

2. **Run the container**
```bash
docker run -d \
  --name md-converter \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/uploads:/app/uploads \
  md-converter:latest
```

3. **View logs**
```bash
docker logs -f md-converter
```

4. **Stop the container**
```bash
docker stop md-converter
docker rm md-converter
```

### Option 3: Cloud Platforms

#### Deploy to Heroku

1. **Create a Heroku app**
```bash
heroku create your-app-name
```

2. **Add buildpacks**
```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add jontewks/puppeteer
```

3. **Set environment variables**
```bash
heroku config:set NODE_ENV=production
```

4. **Deploy**
```bash
git push heroku main
```

#### Deploy to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables:
   - `NODE_ENV=production`

#### Deploy to Railway

1. Create a new project on Railway
2. Connect your GitHub repository
3. Railway will auto-detect Node.js
4. Add environment variables if needed

#### Deploy to DigitalOcean App Platform

1. Create a new app
2. Connect your repository
3. Configure:
   - Build Command: `npm run build`
   - Run Command: `npm start`
4. Set environment variables

## Environment Variables

Create a `.env` file for production (see `.env.example`):

```env
NODE_ENV=production
PORT=3000
MAX_FILE_SIZE=10485760
```

## Nginx Reverse Proxy (Optional)

If deploying on a VPS, use Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

Enable HTTPS with Let's Encrypt:
```bash
sudo certbot --nginx -d your-domain.com
```

## Performance Optimization

### 1. Enable Gzip Compression
The application uses Express built-in compression.

### 2. Set Resource Limits
Adjust `max_memory_restart` in `ecosystem.config.js` based on your server.

### 3. Monitor Resources
```bash
# With PM2
pm2 monit

# With Docker
docker stats md-converter
```

## Security Checklist

- ✅ Set `NODE_ENV=production`
- ✅ Use HTTPS in production
- ✅ Set appropriate file size limits
- ✅ Keep dependencies updated: `npm audit fix`
- ✅ Use environment variables for sensitive data
- ✅ Enable rate limiting (consider adding express-rate-limit)
- ✅ Set secure headers (consider adding helmet)

## Monitoring & Logs

### PM2 Logs
```bash
pm2 logs md-converter --lines 100
```

### Docker Logs
```bash
docker-compose logs -f --tail=100
```

### Log Files
- Error logs: `./logs/err.log`
- Output logs: `./logs/out.log`
- Combined logs: `./logs/combined.log`

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000
# or on Windows
netstat -ano | findstr :3000

# Kill the process
kill -9 <PID>
```

### Puppeteer Issues in Docker
The Dockerfile includes all necessary dependencies for Chromium. If issues persist:
- Increase Docker memory limit
- Check logs for specific errors
- Ensure `--no-sandbox` flag is used (already set in server.js)

### Upload Directory Permissions
```bash
chmod 777 uploads
chmod 777 logs
```

## Updating the Application

### With PM2
```bash
git pull
npm install
npm run build
pm2 restart md-converter
```

### With Docker
```bash
git pull
docker-compose down
docker-compose up -d --build
```

## Backup & Recovery

### Backup Configuration
- Configuration files (ecosystem.config.js, .env)
- Custom CSS modifications
- Upload directory (if needed)

### Database
This application doesn't use a database, all conversions are temporary.

## Support

For issues or questions:
- Check the logs first
- Review this deployment guide
- Check GitHub issues
- Contact: your-email@example.com
