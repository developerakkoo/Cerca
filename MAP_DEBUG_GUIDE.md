# 🗺️ Google Maps White Screen - Debug Guide

## 🔍 Step-by-Step Debugging

### Step 1: Check Logcat Output

Open Android Studio **Logcat** and look for these specific messages:

#### ✅ Success Path (what you should see):
```
Starting location fetch...
Internet connection OK, requesting permissions...
Permission granted, fetching location...
Location fetched: Position{...}
Coordinates: 18.xxxx, 73.xxxx
Creating map...
Creating map with coordinates: 18.xxxx 73.xxxx
API Key: Present
Map ID: c834f2070d90cd8b
Map created successfully
Map type set
Clustering enabled
Current location enabled
Location marker set
Map is ready
```

#### ❌ Common Error Messages:

**Error 1: Location Permission Denied**
```
Permission not granted
Location permission is required to show nearby cabs.
```
**Solution:** Grant location permission in app settings

**Error 2: API Key Error**
```
Map Error: API_KEY_INVALID
Map Error: API_NOT_ACTIVATED
```
**Solution:** Check Google Maps API key restrictions

**Error 3: Map ID Error**
```
Map Error: MAP_ID_NOT_FOUND
```
**Solution:** Verify Map ID in Google Cloud Console

**Error 4: Location Timeout**
```
Location request timed out
```
**Solution:** Enable GPS and ensure good signal

---

## 🔧 Quick Fixes

### Fix 1: Remove API Key Restrictions (Testing Only)

1. Go to: https://console.cloud.google.com/google/maps-apis/credentials
2. Click on your API key: `AIzaSyADFvEEjDAljOg3u9nBd1154GIZwFWnono`
3. Under **Application restrictions**: Select **"None"**
4. Under **API restrictions**: Select **"Don't restrict key"**
5. Click **Save**
6. Wait 1-2 minutes for changes to propagate
7. Rebuild and test app

### Fix 2: Try Without Map ID (Temporary Test)

Edit `src/app/tab1/tab1.page.ts`:

```typescript
const newMap = await GoogleMap.create({
  id: 'my-map',
  element: this.mapRef.nativeElement,
  apiKey: environment.apiKey,
  config: {
    center: { lat: lat, lng: lng },
    // mapId: environment.mapId,  // COMMENT THIS OUT
    zoom: 18,
  },
});
```

Rebuild and test. If map appears without mapId, then your Map ID needs configuration.

### Fix 3: Test with Hardcoded Coordinates

Edit `src/app/tab1/tab1.page.ts` - in `ngAfterViewInit()`:

```typescript
ngAfterViewInit() {
  setTimeout(() => {
    // Test with Pune coordinates
    this.createMap(18.5204, 73.8567);  // Hardcoded Pune
    // Comment out: this.getCurrentPosition();
  }, 2000);
}
```

If this works, the issue is with location permissions/fetching.

### Fix 4: Check Google Play Services

On your Android device:
1. Go to **Settings** → **Apps** → **Google Play Services**
2. Ensure it's updated to latest version
3. Clear cache if needed
4. Restart device

### Fix 5: Verify Permissions in App

1. Open app on device
2. Go to device **Settings** → **Apps** → **Cerca**
3. Tap **Permissions**
4. Ensure **Location** is set to **"Allow only while using the app"**
5. Restart app

---

## 📱 Device-Specific Checks

### Check Internet Connection
```typescript
// In your device browser, try opening:
https://maps.googleapis.com/maps/api/js?key=AIzaSyADFvEEjDAljOg3u9nBd1154GIZwFWnono
```

Should show Google Maps API JavaScript. If error, API key is restricted/invalid.

### Check GPS
- Enable **High accuracy** mode in Location settings
- Ensure you're not indoors/basement (affects GPS)
- Try outdoors for better signal

---

## 🔬 Advanced Debugging

### Enable Detailed Logging

Add this to `src/app/tab1/tab1.page.ts`:

```typescript
async createMap(lat: number, lng: number) {
  try {
    console.log('=== MAP DEBUG START ===');
    console.log('Latitude:', lat);
    console.log('Longitude:', lng);
    console.log('API Key:', environment.apiKey);
    console.log('Map ID:', environment.mapId);
    console.log('Map Element:', this.mapRef?.nativeElement);
    console.log('Element exists:', !!this.mapRef?.nativeElement);
    
    const newMap = await GoogleMap.create({
      id: 'my-map',
      element: this.mapRef.nativeElement,
      apiKey: environment.apiKey,
      config: {
        center: { lat, lng },
        mapId: environment.mapId,
        zoom: 18,
      },
    });
    
    console.log('=== MAP CREATED ===');
    console.log('Map object:', newMap);
    
  } catch (error: any) {
    console.error('=== MAP ERROR ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('Error stack:', error?.stack);
  }
}
```

### Check HTML Element

Verify the map container exists in `src/app/tab1/tab1.page.html`:

```html
<capacitor-google-map 
  #map 
  id="map" 
  style="width: 100%; height: 100vh;">
</capacitor-google-map>
```

Should have:
- `#map` reference
- `id="map"`
- Valid dimensions (width/height)

---

## 🎯 Most Common Solutions

### Solution 1: API Key Not Activated (80% of cases)

**Problem:** Map shows white/blank screen, no errors

**Fix:**
1. Google Cloud Console → APIs & Services → Enabled APIs
2. Ensure **"Maps SDK for Android"** is ENABLED
3. Also enable: **"Maps JavaScript API"** (for Capacitor)
4. Wait 5-10 minutes
5. Rebuild app

### Solution 2: Wrong API Key in Environment

**Check:** `src/environments/environment.ts`
```typescript
apiKey: 'AIzaSyADFvEEjDAljOg3u9nBd1154GIZwFWnono'  // Should match Cloud Console
```

**Check:** `android/app/src/main/AndroidManifest.xml`
```xml
<meta-data 
  android:name="com.google.android.geo.API_KEY" 
  android:value="AIzaSyADFvEEjDAljOg3u9nBd1154GIZwFWnono"/>
```

Both should match!

### Solution 3: Build Not Synced

After any changes:
```bash
npm run build
npx cap sync android
```

Then in Android Studio: **Build → Rebuild Project**

---

## 🆘 Emergency Workaround

If nothing works, use a simple test:

**File:** `src/app/tab1/tab1.page.ts`

```typescript
async createMap(lat: number, lng: number) {
  try {
    // SIMPLEST POSSIBLE MAP
    const newMap = await GoogleMap.create({
      id: 'my-map',
      element: this.mapRef.nativeElement,
      apiKey: 'AIzaSyADFvEEjDAljOg3u9nBd1154GIZwFWnono',  // Hardcoded
      config: {
        center: { lat: 18.5204, lng: 73.8567 },  // Hardcoded Pune
        zoom: 15,
        // NO mapId, NO extras
      },
    });

    this.newMap = newMap;
    this.isMapReady = true;
    alert('Map loaded!');  // Visual confirmation
    
  } catch (error: any) {
    alert('Map Error: ' + error.message);  // Visual error
    console.error('Map error:', error);
  }
}
```

If this works → Problem is with your environment config or location fetching
If this fails → Problem is with API key or device setup

---

## 📞 What to Check in Logcat

**In Android Studio Logcat, search for these terms:**

1. `"Map Error"` - Our custom error messages
2. `"GoogleMap"` - Capacitor Google Maps logs
3. `"permission"` - Location permission issues
4. `"API_KEY"` - API key errors
5. `"unauthorized"` - Restriction errors

**Share the relevant logs to get specific help!**

---

## ✅ Checklist

- [ ] Location permission granted in app
- [ ] GPS enabled on device
- [ ] Internet connection active
- [ ] Google Play Services updated
- [ ] API key restrictions removed (for testing)
- [ ] Maps SDK for Android enabled in Cloud Console
- [ ] Build synced after changes
- [ ] Checked Logcat for errors
- [ ] Tried without mapId
- [ ] Tried with hardcoded coordinates

---

**Most likely issue:** API key restrictions. Remove them first!

**Second most likely:** Maps SDK for Android not enabled in Google Cloud Console.

**Check Logcat and share the specific error message for targeted help!**

