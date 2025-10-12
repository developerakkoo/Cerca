# 🔧 API Connection Fix for Android Device

## Problem
Android devices can't access `localhost` or `127.0.0.1` because that refers to the device itself, not your development machine.

## ✅ Solution

### Step 1: Verify Your Backend Server is Running

**Check if your server is running:**
```bash
curl http://localhost:3000
# OR
curl http://192.168.1.12:3000
```

If you get a response, server is running. If not, start your server:
```bash
# Navigate to your backend directory
cd /path/to/your/backend
npm run dev  # or whatever command starts your server
```

### Step 2: Make Server Accessible from Network

Your backend server must listen on `0.0.0.0` (all network interfaces), not just `localhost`.

**Check your server configuration:**

**For Express.js:**
```javascript
// ❌ WRONG - only accessible from localhost
app.listen(3000, 'localhost');

// ✅ CORRECT - accessible from network
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:3000');
  console.log('Access from device: http://192.168.1.12:3000');
});
```

**For Socket.IO:**
```javascript
const io = require('socket.io')(server, {
  cors: {
    origin: "*",  // For development - restrict in production
    methods: ["GET", "POST"]
  }
});
```

### Step 3: Allow Firewall Access

**On Linux (Ubuntu/Debian):**
```bash
# Allow port 3000
sudo ufw allow 3000/tcp

# OR disable firewall temporarily for testing
sudo ufw disable
```

### Step 4: Test Connection from Device

**Using Android device browser:**
1. Open Chrome on your Android device
2. Navigate to: `http://192.168.1.12:3000`
3. You should see your API response or server message

If you see "Connection refused" or "Can't reach this page":
- Server isn't running
- Firewall blocking
- Wrong IP address

### Step 5: Ensure Device and PC are on Same WiFi

**Both must be on the SAME WiFi network!**

Check:
- **PC**: Connected to WiFi (192.168.1.12)
- **Android Device**: Connected to SAME WiFi network

### Step 6: Update Environment Files (If IP Changed)

Your current configuration:
```typescript
apiUrl: 'http://192.168.1.12:3000'
```

If your IP address changed, update it:
```bash
# Get your current IP
hostname -I | awk '{print $1}'
```

Then update `src/environments/environment.ts` with the new IP.

---

## 🧪 Quick Test

### Test 1: Ping Server from PC
```bash
curl http://192.168.1.12:3000
```

### Test 2: Test from Android Device Browser
Open Chrome on device → `http://192.168.1.12:3000`

### Test 3: Test Socket.IO Connection
```bash
# In your backend logs, you should see:
"Client connected: [socket-id]"
```

---

## 🔍 Debugging

### Check Backend Logs
When you open the app, check your backend console for:
```
POST /api/auth/login
Socket connection from: [IP]
```

### Check Android Logcat
Filter by "CapacitorHttp" or "Socket" to see network requests:
```
Making HTTP request to: http://192.168.1.12:3000/api/auth/login
```

---

## 📝 Common Issues

### Issue 1: "Network Error" or "Failed to Connect"
**Solution:** 
- Check server is running
- Verify firewall allows port 3000
- Ensure same WiFi network

### Issue 2: "CORS Error"
**Solution:** Add CORS headers to your backend:
```javascript
app.use(cors({
  origin: '*',  // For development
  credentials: true
}));
```

### Issue 3: "Connection Timeout"
**Solution:**
- Check IP address is correct
- Ping server from device browser first
- Verify server is listening on 0.0.0.0

---

## 🚀 Production Setup (Later)

For production, use a proper domain:
```typescript
// environment.prod.ts
apiUrl: 'https://api.myserverdevops.com'
```

With HTTPS and proper CORS restrictions.

---

## ✅ Checklist

- [ ] Backend server running on port 3000
- [ ] Server listening on 0.0.0.0 (not localhost)
- [ ] Firewall allows port 3000
- [ ] PC and device on same WiFi
- [ ] Can access http://192.168.1.12:3000 from device browser
- [ ] CORS enabled in backend
- [ ] Environment.ts has correct IP address
- [ ] App rebuilt after environment changes

