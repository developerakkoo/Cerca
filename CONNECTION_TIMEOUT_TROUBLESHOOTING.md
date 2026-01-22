# Socket Connection Timeout Troubleshooting Guide

## Problem
The user app is experiencing connection timeouts when trying to connect to `api.myserverdevops.com`:
- `net::ERR_CONNECTION_TIMED_OUT` errors
- Socket.IO `xhr poll error` (TransportError)
- HTTP requests timing out

## Root Causes

### 1. **Server Transport Mismatch** ⚠️ CRITICAL
The backend server is configured to ONLY accept `websocket` transport, but the client tries `polling` first:
- **Server**: `transports: ['websocket']` (in `Cerca-API/utils/socket.js`)
- **Client**: `transports: ['polling', 'websocket']` (in `Cerca/src/app/app.module.ts`)

**Fix**: Update server to allow both transports.

### 2. **Server Not Running or Not Accessible**
The API server at `api.myserverdevops.com` might be:
- Not running on port 3000
- Not accessible from the client's network
- Blocked by firewall
- DNS resolution issues

### 3. **Nginx Configuration Issues**
The reverse proxy might not be:
- Running
- Properly configured
- Forwarding requests correctly

### 4. **SSL/TLS Certificate Issues**
HTTPS connections might fail due to:
- Invalid or expired certificates
- Certificate chain issues
- Mixed content issues

## Diagnostic Steps

### Step 1: Check Server Status
```bash
# SSH into your server
ssh user@your-server

# Check if Node.js server is running
ps aux | grep node
# or
pm2 list  # if using PM2

# Check if server is listening on port 3000
netstat -tulpn | grep 3000
# or
ss -tulpn | grep 3000

# Check server logs
tail -f /path/to/api/logs/error.log
```

### Step 2: Test API Endpoint Directly
```bash
# Test HTTP endpoint (should redirect to HTTPS)
curl -I http://api.myserverdevops.com

# Test HTTPS endpoint
curl -I https://api.myserverdevops.com

# Test Socket.IO endpoint
curl -I https://api.myserverdevops.com/socket.io/
```

### Step 3: Check Nginx Status
```bash
# Check if Nginx is running
sudo systemctl status nginx

# Check Nginx configuration
sudo nginx -t

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Reload Nginx if needed
sudo systemctl reload nginx
```

### Step 4: Check DNS Resolution
```bash
# From client machine
nslookup api.myserverdevops.com
# or
dig api.myserverdevops.com

# Test connectivity
ping api.myserverdevops.com
```

### Step 5: Check Firewall Rules
```bash
# Check if port 443 (HTTPS) is open
sudo ufw status
# or
sudo iptables -L -n

# Check if port 3000 is accessible locally
curl http://localhost:3000
```

### Step 6: Test Socket.IO Connection
```bash
# Using curl to test Socket.IO handshake
curl -v "https://api.myserverdevops.com/socket.io/?EIO=4&transport=polling"
```

## Fixes

### Fix 1: Update Server Socket Transport Configuration

**File**: `Cerca-API/utils/socket.js`

Change:
```javascript
transports: ['websocket'],
```

To:
```javascript
transports: ['polling', 'websocket'], // Allow both for better compatibility
```

This allows clients to connect using polling first, then upgrade to websocket.

### Fix 2: Verify Server is Running

Ensure your Node.js server is running:
```bash
cd /path/to/Cerca-API
npm start
# or if using PM2
pm2 start index.js --name cerca-api
pm2 save
```

### Fix 3: Verify Nginx Configuration

Ensure Nginx is properly configured and running. Check `nginx_socketio_config.conf`:
- Socket.IO location block should proxy to `http://127.0.0.1:3000`
- WebSocket upgrade headers should be set
- SSL certificates should be valid

### Fix 4: Increase Client Timeout (Temporary Workaround)

If server is slow to respond, increase timeout in client:

**File**: `Cerca/src/app/app.module.ts`

Change:
```typescript
timeout: 20000,
```

To:
```typescript
timeout: 60000, // 60 seconds
```

## Testing After Fixes

1. **Restart Backend Server**:
   ```bash
   cd Cerca-API
   npm start
   ```

2. **Reload Nginx**:
   ```bash
   sudo systemctl reload nginx
   ```

3. **Test from Browser Console**:
   ```javascript
   // Test Socket.IO connection
   const socket = io('https://api.myserverdevops.com', {
     transports: ['polling', 'websocket'],
     query: {
       userId: 'test-user-id',
       userType: 'rider'
     }
   });
   
   socket.on('connect', () => console.log('Connected!'));
   socket.on('connect_error', (error) => console.error('Error:', error));
   ```

4. **Check Network Tab**:
   - Open browser DevTools → Network tab
   - Filter by "WS" or "XHR"
   - Look for Socket.IO requests
   - Check if they're timing out or getting responses

## Common Issues and Solutions

### Issue: "ERR_CONNECTION_TIMED_OUT"
**Solution**: Server is not accessible. Check:
- Server is running
- Firewall allows connections
- DNS resolves correctly
- Nginx is running and configured

### Issue: "xhr poll error"
**Solution**: Transport mismatch or server not accepting polling. Fix:
- Update server to allow `polling` transport
- Check Nginx WebSocket configuration

### Issue: "SSL certificate error"
**Solution**: Certificate issues. Fix:
- Renew SSL certificate: `sudo certbot renew`
- Check certificate validity: `openssl s_client -connect api.myserverdevops.com:443`

### Issue: "404 Not Found" on Socket.IO endpoint
**Solution**: Nginx not routing correctly. Fix:
- Check Nginx location block for `/socket.io/`
- Ensure proxy_pass points to correct backend
- Reload Nginx configuration

## Monitoring

After applying fixes, monitor:
- Server logs for connection attempts
- Nginx access/error logs
- Client console for connection status
- Network tab for request/response details

## Next Steps

1. Apply Fix 1 (update server transport configuration)
2. Verify server is running and accessible
3. Test connection from browser console
4. Check logs for any remaining errors
5. If issues persist, check server infrastructure (firewall, DNS, SSL)

