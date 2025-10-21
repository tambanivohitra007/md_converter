# Production Checklist

## Pre-Deployment

### Code Quality
- [x] All features tested and working
- [x] No console errors in browser
- [x] No server errors in terminal
- [x] All files properly formatted
- [x] Comments added where needed

### Build
- [x] Production CSS built with minification
- [x] All dependencies installed
- [x] No critical npm audit vulnerabilities
- [ ] Update browserslist database: `npm run update-browserslist`

### Configuration
- [x] `.env.example` created
- [ ] `.env` file created for production (don't commit!)
- [x] `.gitignore` configured properly
- [x] PM2 ecosystem.config.js configured
- [x] Docker files created

### Security
- [ ] Set `NODE_ENV=production` in environment
- [ ] Review file upload limits (currently 10MB)
- [ ] Consider adding rate limiting
- [ ] Consider adding helmet for security headers
- [ ] Ensure uploads directory is outside web root
- [ ] Review CORS settings if needed

## Deployment Options

### Option 1: Traditional Server (PM2)
- [ ] Install Node.js 18+ on server
- [ ] Install PM2 globally: `npm install -g pm2`
- [ ] Clone repository to server
- [ ] Run `npm install --production`
- [ ] Run `npm run build`
- [ ] Start with PM2: `pm2 start ecosystem.config.js --env production`
- [ ] Save PM2 config: `pm2 save`
- [ ] Set PM2 to start on boot: `pm2 startup`
- [ ] Configure Nginx reverse proxy (optional)
- [ ] Set up SSL certificate with Let's Encrypt

### Option 2: Docker Deployment
- [ ] Install Docker and Docker Compose
- [ ] Build image: `docker-compose up -d --build`
- [ ] Verify container is running: `docker ps`
- [ ] Check logs: `docker-compose logs -f`
- [ ] Set up volume mounts for persistence
- [ ] Configure health checks
- [ ] Set up automatic restarts

### Option 3: Cloud Platform
- [ ] Choose platform (Heroku, Render, Railway, DigitalOcean, AWS, etc.)
- [ ] Connect repository
- [ ] Configure build command: `npm run build`
- [ ] Configure start command: `npm start`
- [ ] Set environment variables
- [ ] Configure auto-deployment from Git

## Post-Deployment

### Verification
- [ ] Access application URL
- [ ] Test file upload functionality
- [ ] Test all conversion formats (HTML, PDF, DOCX)
- [ ] Test theme customization
- [ ] Test all code highlighting themes
- [ ] Test custom CSS injection
- [ ] Verify toast notifications
- [ ] Test keyboard navigation
- [ ] Test on mobile devices
- [ ] Check browser console for errors
- [ ] Verify auto-download works

### Monitoring
- [ ] Set up log monitoring
- [ ] Configure error alerts
- [ ] Monitor resource usage (CPU, memory)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] Configure application performance monitoring (optional)

### Documentation
- [x] README.md complete
- [x] DEPLOYMENT.md complete
- [ ] Update repository URL in README
- [ ] Update contact email in README
- [ ] Add license file if needed
- [ ] Document any environment-specific configurations

## Maintenance

### Regular Tasks
- [ ] Review and rotate logs
- [ ] Update dependencies monthly: `npm update`
- [ ] Run security audits: `npm audit`
- [ ] Monitor disk space (uploads directory)
- [ ] Review error logs weekly
- [ ] Test backup/restore procedures

### Updates
- [ ] Document update procedure
- [ ] Test updates in staging environment first
- [ ] Schedule maintenance windows
- [ ] Notify users of planned downtime
- [ ] Keep rollback plan ready

## Performance Optimization

### Server
- [x] Enable clustering with PM2 (configured)
- [ ] Configure Nginx for static file caching
- [ ] Enable Gzip compression
- [ ] Set up CDN for static assets (optional)
- [ ] Optimize Puppeteer memory usage

### Application
- [x] Minified CSS
- [ ] Consider adding express-rate-limit
- [ ] Implement request queueing for conversions
- [ ] Add conversion timeout limits
- [ ] Optimize large file handling

## Security Hardening

### Essential
- [ ] Use HTTPS only in production
- [ ] Set secure cookie flags
- [ ] Implement CSRF protection if using sessions
- [ ] Add helmet.js for security headers
- [ ] Rate limit API endpoints
- [ ] Validate all user inputs
- [ ] Sanitize file names

### Advanced
- [ ] Implement API authentication
- [ ] Add request signing
- [ ] Set up Web Application Firewall (WAF)
- [ ] Enable audit logging
- [ ] Implement user session management
- [ ] Add two-factor authentication (if applicable)

## Backup Strategy

### What to Backup
- [ ] Configuration files
- [ ] Custom CSS modifications
- [ ] Environment variables (securely)
- [ ] SSL certificates
- [ ] Application logs (periodically)

### Backup Schedule
- [ ] Daily automated backups
- [ ] Weekly off-site backups
- [ ] Monthly backup verification
- [ ] Document restore procedure

## Disaster Recovery

### Preparation
- [ ] Document complete setup procedure
- [ ] Test restore from backup
- [ ] Keep offline copy of configurations
- [ ] Document external dependencies
- [ ] Create runbook for common issues

### Recovery Plan
- [ ] Define Recovery Time Objective (RTO)
- [ ] Define Recovery Point Objective (RPO)
- [ ] Document escalation procedures
- [ ] Maintain contact list
- [ ] Test disaster recovery annually

## Compliance (if applicable)

### Data Privacy
- [ ] Review data retention policies
- [ ] Implement data deletion procedures
- [ ] Add privacy policy
- [ ] Add terms of service
- [ ] Document data handling procedures

### Accessibility
- [x] WCAG 2.1 AA compliant
- [x] Keyboard navigation tested
- [ ] Screen reader tested
- [ ] Color contrast verified
- [ ] Alt text for images added

## Scaling Considerations

### When to Scale
- Monitor these metrics:
  - [ ] CPU usage consistently > 70%
  - [ ] Memory usage consistently > 80%
  - [ ] Response time > 3 seconds
  - [ ] Error rate > 1%
  - [ ] Request queue backing up

### Scaling Options
- [ ] Increase PM2 instances
- [ ] Add more server instances
- [ ] Implement load balancer
- [ ] Use separate PDF generation workers
- [ ] Implement caching layer
- [ ] Use message queue for async processing

## Final Checks

- [ ] All checklist items completed
- [ ] Test credentials changed from defaults
- [ ] Monitoring dashboards configured
- [ ] Team trained on deployment procedures
- [ ] Documentation reviewed and updated
- [ ] Emergency contacts documented
- [ ] Rollback procedure tested
- [ ] Performance baselines established
- [ ] Monitoring alerts configured
- [ ] Success criteria defined and met

## Notes

Add any deployment-specific notes here:
- Server IP/hostname:
- Domain name:
- SSL certificate expiry:
- Deployment date:
- Deployed by:
- Special configurations:

---

**Deployment Sign-off**

- [ ] Development lead approval
- [ ] QA testing passed
- [ ] Security review completed
- [ ] Documentation reviewed
- [ ] Stakeholder approval

Date: _______________
By: _______________
