# iOS Compatibility Issues & Recommendations

## Executive Summary

This document catalogs all iOS compatibility issues found in the Cerca app, organized by severity and priority. Issues range from critical warnings that will cause future iOS version incompatibility to minor UI/UX improvements.

**Total Issues Found:** 10  
**Critical:** 2 | **High Priority:** 4 | **Medium Priority:** 3 | **Low Priority:** 1

---

## 🔴 Critical Issues (Must Fix)

### 1. UIScene Lifecycle Deprecation Warning

**Severity:** 🔴 Critical  
**Status:** ⚠️ Warning in logs  
**Location:** `ios/App/App/AppDelegate.swift`

**Issue:**
```
UIScene lifecycle will soon be required. Failure to adopt will result in an assert in the future.
```

The app uses deprecated `@UIApplicationMain` instead of the modern UIScene-based lifecycle. This will cause app crashes in future iOS versions.

**Impact:**
- App will fail to launch on future iOS versions (likely iOS 18+)
- Current warning indicates Apple is preparing to enforce this requirement
- May cause App Store rejection in future submissions

**Current Code:**
```swift
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    // ...
}
```

**Recommended Fix:**
1. Migrate to UIScene-based lifecycle
2. Create `SceneDelegate.swift` for scene management
3. Update `Info.plist` to include `UIApplicationSceneManifest` key
4. Remove `@UIApplicationMain` and use `@main` with scene configuration

**References:**
- [Apple UIScene Documentation](https://developer.apple.com/documentation/uikit/app_and_environment/scenes)
- [Capacitor iOS Migration Guide](https://capacitorjs.com/docs/ios/configuration)

---

### 2. Multiple Map Instances Causing Conflicts

**Severity:** 🔴 Critical  
**Status:** 🐛 Active Bug  
**Location:** `src/app/tab1/tab1.page.ts`, `src/app/pages/search/search.page.ts`

**Issue:**
Multiple map instances are being created simultaneously, causing "Map not found for provided id" errors. The logs show:
```
ERROR MESSAGE: {"message":"Map not found for provided id.","errorMessage":"Map not found for provided id.","data":{},"code":"2"}
```

**Impact:**
- Maps fail to render properly
- Performance degradation
- Memory leaks from orphaned map instances
- User experience degradation (white screens, crashes)

**Root Causes:**
1. Map initialization called multiple times from different lifecycle hooks (`ionViewWillEnter`, `ionViewDidEnter`, router events)
2. Insufficient guards to prevent duplicate map creation
3. Map cleanup not always called before recreation
4. Race conditions between map creation and destruction

**Current Problem Areas:**
```typescript
// tab1.page.ts - Multiple initialization points
async ionViewWillEnter() {
  await this.initializeMap(); // Called
}

async ionViewDidEnter() {
  await this.initializeMap(); // Called again
}

// Router subscription also calls initializeMap()
this.routerSubscription = this.router.events.subscribe(() => {
  this.initializeMap(); // Called again
});
```

**Recommended Fix:**
1. Implement singleton pattern for map instances per page
2. Add stronger guards: `if (this.isMapCreationInProgress || this.newMap) return;`
3. Consolidate initialization to single lifecycle hook
4. Ensure cleanup completes before new creation
5. Add debouncing for rapid navigation events

**Code Example:**
```typescript
private async initializeMap(): Promise<void> {
  // Strong guard
  if (this.isMapCreationInProgress) {
    console.log('Map creation already in progress');
    return;
  }
  
  if (this.newMap) {
    console.log('Map already exists');
    return;
  }
  
  this.isMapCreationInProgress = true;
  try {
    // Create map
  } finally {
    this.isMapCreationInProgress = false;
  }
}
```

---

## 🟠 High Priority Issues

### 3. Map Rendering White Screen on iOS

**Severity:** 🟠 High  
**Status:** 🔧 Partially Fixed  
**Location:** `src/app/tab1/tab1.page.html`, `src/app/tab1/tab1.page.scss`

**Issue:**
Map shows white screen on iOS devices despite successful creation. The map is created (logs show success) but not visible.

**Impact:**
- Poor user experience
- App appears broken
- Users cannot interact with map

**Root Cause:**
Map container positioning conflicts with iOS viewport handling. The header component uses absolute positioning, which doesn't affect layout, causing percentage-based heights to fail.

**Current Status:**
- Fixed: Removed inline `height: 100vh` styles
- Fixed: Added `.map-container` wrapper
- Fixed: Changed to absolute positioning
- ⚠️ Needs verification on physical iOS device

**Recommended Verification:**
1. Test on physical iOS device (iPhone 12+)
2. Test on devices with notches/Dynamic Island
3. Verify map fills entire viewport
4. Test map gestures (pan, zoom, rotate)

**Files Modified:**
- `src/app/tab1/tab1.page.html` - Added map-container wrapper
- `src/app/tab1/tab1.page.scss` - Changed to absolute positioning

---

### 4. Inconsistent Safe Area Handling

**Severity:** 🟠 High  
**Status:** ⚠️ Partial Implementation  
**Location:** Multiple SCSS files

**Issue:**
Safe area insets are used inconsistently across components. Some components handle safe areas, others don't, causing content to be hidden behind notches/Dynamic Island.

**Impact:**
- Content hidden behind iPhone notches/Dynamic Island
- Poor UX on newer iPhone models (iPhone X and later)
- Status bar overlaps content
- Bottom content hidden behind home indicator

**Current Implementation:**
```scss
// header.component.scss - HAS safe area
ion-toolbar {
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

// driver-chat.page.scss - HAS safe area
.chat-input {
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}

// Most other components - MISSING safe area
```

**Components Missing Safe Area:**
- `tab1.page.scss` - Map container
- `search.page.scss` - Map container
- `modal.component.scss` - Bottom modal
- Most page components

**Recommended Fix:**
1. Add safe area insets to all fixed/absolute positioned elements
2. Use CSS custom properties for consistency:
   ```scss
   :root {
     --safe-area-top: env(safe-area-inset-top);
     --safe-area-bottom: env(safe-area-inset-bottom);
     --safe-area-left: env(safe-area-inset-left);
     --safe-area-right: env(safe-area-inset-right);
   }
   ```
3. Update all components to use safe area insets
4. Test on iPhone X, 11, 12, 13, 14, 15 series

**Priority Components:**
1. Map containers (tab1, search)
2. Bottom modals
3. Fixed headers/footers
4. Full-screen overlays

---

### 5. Keyboard Event Handling on iOS

**Severity:** 🟠 High  
**Status:** ⚠️ Unreliable  
**Location:** `src/app/components/modal/modal.component.ts`

**Issue:**
Using `window:keyboardWillShow` and `window:keyboardWillHide` events which may not fire reliably on iOS, especially in Capacitor apps.

**Current Code:**
```typescript
@HostListener('window:keyboardWillShow')
onKeyboardShow() {
  this.isKeyboardOpen = true;
}

@HostListener('window:keyboardWillHide')
onKeyboardHide() {
  this.isKeyboardOpen = false;
}
```

**Impact:**
- Modal height doesn't adjust when keyboard appears
- Input fields may be hidden behind keyboard
- Poor UX on iOS devices
- Inconsistent behavior across iOS versions

**Recommended Fix:**
1. Use Capacitor Keyboard plugin instead:
   ```typescript
   import { Keyboard } from '@capacitor/keyboard';
   
   async ngOnInit() {
     Keyboard.addListener('keyboardWillShow', () => {
       this.isKeyboardOpen = true;
     });
     
     Keyboard.addListener('keyboardWillHide', () => {
       this.isKeyboardOpen = false;
     });
   }
   ```
2. Use `Keyboard.getResizeMode()` to check current mode
3. Handle keyboard events in `ionViewDidEnter` lifecycle
4. Clean up listeners in `ngOnDestroy`

**Alternative Approach:**
Use CSS `env(keyboard-inset-height)` if supported, or Ionic's built-in keyboard handling.

---

### 6. Viewport Height (100vh) Issues on iOS Safari

**Severity:** 🟠 High  
**Status:** ⚠️ Potential Issue  
**Location:** Multiple SCSS files

**Issue:**
Using `100vh` in CSS doesn't account for iOS Safari's browser chrome (address bar, toolbar), causing layout issues.

**Current Usage:**
```scss
// modal.component.scss
max-height: 90vh;
height: 20vh;

// maintenance.page.scss, force-update.page.scss, blocked.page.scss
min-height: 100vh;
```

**Impact:**
- Content cut off at bottom on iOS Safari
- Modals don't fit properly
- Layout shifts when browser chrome appears/disappears
- Inconsistent behavior between iOS Safari and native app

**Recommended Fix:**
1. Use `dvh` (dynamic viewport height) for modern browsers:
   ```scss
   height: 100dvh; // Falls back to 100vh for older browsers
   ```
2. Use `calc()` with safe area insets:
   ```scss
   height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
   ```
3. Use JavaScript to calculate actual viewport height:
   ```typescript
   const vh = window.innerHeight * 0.01;
   document.documentElement.style.setProperty('--vh', `${vh}px`);
   ```
   Then use: `height: calc(var(--vh, 1vh) * 100);`

**Priority Files:**
- `src/app/components/modal/modal.component.scss`
- `src/app/pages/maintenance/maintenance.page.scss`
- `src/app/pages/force-update/force-update.page.scss`
- `src/app/pages/blocked/blocked.page.scss`

---

## 🟡 Medium Priority Issues

### 7. Status Bar Configuration

**Severity:** 🟡 Medium  
**Status:** ⚠️ Suboptimal  
**Location:** `src/index.html`

**Issue:**
Status bar style is set to "black" which may not work well with light backgrounds and doesn't adapt to content.

**Current Code:**
```html
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
```

**Impact:**
- Status bar may not be visible on light backgrounds
- Doesn't adapt to app theme
- Poor contrast in some scenarios

**Recommended Fix:**
1. Use "black-translucent" for better visibility:
   ```html
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   ```
2. Or use "default" for automatic adaptation
3. Configure via Capacitor StatusBar plugin for more control:
   ```typescript
   import { StatusBar, Style } from '@capacitor/status-bar';
   
   StatusBar.setStyle({ style: Style.Light }); // or Style.Dark
   ```

---

### 8. Sandbox Extension Errors

**Severity:** 🟡 Medium  
**Status:** ⚠️ Warning in logs  
**Location:** iOS runtime

**Issue:**
```
Could not create a sandbox extension for '/var/containers/Bundle/Application/.../App.app'
```

**Impact:**
- May affect file system access
- Could cause issues with Capacitor plugins
- May prevent proper app initialization

**Possible Causes:**
1. App entitlements not properly configured
2. File system permissions issues
3. Capacitor plugin configuration problems

**Recommended Fix:**
1. Check app entitlements in Xcode project settings
2. Verify Capacitor plugins have proper permissions
3. Review `Info.plist` for missing file access keys
4. Check if this is a known Capacitor issue and update if needed

**Investigation Steps:**
1. Check Xcode project entitlements
2. Review Capacitor plugin configurations
3. Test file system operations
4. Check for Capacitor updates

---

### 9. Info.plist Missing Modern iOS Keys

**Severity:** 🟡 Medium  
**Status:** ⚠️ Missing Configuration  
**Location:** `ios/App/App/Info.plist`

**Issue:**
Missing modern iOS configuration keys that could improve compatibility and user experience.

**Missing Keys:**
1. `UIApplicationSceneManifest` - Required for UIScene support
2. `ITSAppUsesNonExemptEncryption` - Required for App Store submission
3. `UIRequiresFullScreen` - For iPad multitasking
4. `UIApplicationSupportsIndirectInputEvents` - For Apple Pencil/pointer support

**Impact:**
- Cannot migrate to UIScene lifecycle
- App Store submission may be delayed
- Missing iPad optimizations
- Limited input device support

**Recommended Additions:**
```xml
<!-- UIScene Support -->
<key>UIApplicationSceneManifest</key>
<dict>
  <key>UIApplicationSupportsMultipleScenes</key>
  <false/>
  <key>UISceneConfigurations</key>
  <dict>
    <key>UIWindowSceneSessionRoleApplication</key>
    <array>
      <dict>
        <key>UISceneConfigurationName</key>
        <string>Default Configuration</string>
        <key>UISceneDelegateClassName</key>
        <string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
      </dict>
    </array>
  </dict>
</dict>

<!-- App Store Encryption -->
<key>ITSAppUsesNonExemptEncryption</key>
<false/>

<!-- iPad Support -->
<key>UIRequiresFullScreen</key>
<true/>
```

---

## 🟢 Low Priority Issues

### 10. WebKit-Specific CSS Properties

**Severity:** 🟢 Low  
**Status:** ✅ Working but could be improved  
**Location:** Multiple SCSS files

**Issue:**
Using `-webkit-` prefixed properties without fallbacks. While these work on iOS, modern CSS should use standard properties with vendor prefixes as fallback.

**Current Usage:**
```scss
-webkit-overflow-scrolling: touch;
-webkit-backdrop-filter: blur(10px);
-webkit-mask: linear-gradient(#fff 0 0) content-box;
-webkit-tap-highlight-color: transparent;
-webkit-appearance: none;
```

**Impact:**
- Minor: Code maintainability
- Works fine on iOS but not future-proof
- Missing fallbacks for other browsers

**Recommended Fix:**
Use standard properties with `-webkit-` as fallback:
```scss
// Instead of just -webkit-overflow-scrolling
overflow-scrolling: touch;
-webkit-overflow-scrolling: touch;

// Instead of just -webkit-backdrop-filter
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
```

**Priority:** Low - These work fine on iOS, but standardizing would improve code quality.

---

## 📋 Testing Checklist

### Critical Tests
- [ ] Test app on iOS 17+ device
- [ ] Verify UIScene warning doesn't appear
- [ ] Test map rendering on tab1 page
- [ ] Verify no "Map not found" errors
- [ ] Test on iPhone with notch/Dynamic Island
- [ ] Verify safe areas work correctly

### High Priority Tests
- [ ] Test keyboard handling in modal component
- [ ] Verify modal adjusts when keyboard appears
- [ ] Test viewport height on iOS Safari
- [ ] Verify content isn't cut off
- [ ] Test on multiple iPhone models (X, 12, 13, 14, 15)

### Medium Priority Tests
- [ ] Verify status bar visibility
- [ ] Test file system operations
- [ ] Check sandbox extension errors
- [ ] Verify Info.plist keys are correct

### Device Testing Matrix
| Device | iOS Version | Status | Notes |
|--------|-------------|--------|-------|
| iPhone 12 | iOS 17+ | ⚠️ Needs Testing | UIScene warning |
| iPhone 13 | iOS 16+ | ⚠️ Needs Testing | Safe areas |
| iPhone 14 | iOS 16+ | ⚠️ Needs Testing | Dynamic Island |
| iPhone 15 | iOS 17+ | ⚠️ Needs Testing | Latest features |
| iPad | iOS 16+ | ⚠️ Needs Testing | Multitasking |

---

## 🔧 Recommended Implementation Order

### Phase 1: Critical Fixes (Week 1)
1. ✅ Fix map rendering white screen (DONE)
2. 🔄 Fix multiple map instances issue
3. 🔄 Migrate to UIScene lifecycle

### Phase 2: High Priority (Week 2)
4. Add safe area handling to all components
5. Fix keyboard event handling
6. Fix viewport height issues

### Phase 3: Medium Priority (Week 3)
7. Update status bar configuration
8. Investigate sandbox extension errors
9. Add missing Info.plist keys

### Phase 4: Low Priority (Week 4)
10. Standardize webkit CSS properties

---

## 📚 References

### Apple Documentation
- [UIScene Lifecycle](https://developer.apple.com/documentation/uikit/app_and_environment/scenes)
- [Safe Area Layout Guide](https://developer.apple.com/documentation/uikit/uiview/positioning_content_relative_to_the_safe_area)
- [Info.plist Keys](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/iPhoneOSKeys.html)

### Capacitor Documentation
- [iOS Configuration](https://capacitorjs.com/docs/ios/configuration)
- [Keyboard Plugin](https://capacitorjs.com/docs/apis/keyboard)
- [Status Bar Plugin](https://capacitorjs.com/docs/apis/status-bar)

### Related Issues
- Map rendering: See `GOOGLE_MAPS_FIXES.md`
- Permission handling: See `GOOGLE_MAPS_FIXES.md`

---

## 📝 Notes

### Known Working Features
- ✅ Google Maps initialization
- ✅ Location permissions
- ✅ Search page map rendering
- ✅ Basic navigation

### Areas Requiring Attention
- ⚠️ Map lifecycle management
- ⚠️ Safe area consistency
- ⚠️ Keyboard handling reliability
- ⚠️ Future iOS version compatibility

---

**Last Updated:** 2026-01-23  
**Document Version:** 1.0  
**Reviewed By:** Development Team

