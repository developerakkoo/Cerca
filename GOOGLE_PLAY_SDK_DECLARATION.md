# Google Play Console - SDK Declaration Responses

## Question 1: What SDKs does your app use and why?

**Response:**

Our app uses the following SDKs and third-party libraries, each serving a specific functional purpose:

### **Core Framework & Native Bridge**
- **Capacitor 7.2.0** - Native runtime framework that enables our web-based Ionic Angular app to access native device features. This is essential for building a hybrid mobile application.

### **Maps & Location Services**
- **Google Maps SDK (via @capacitor/google-maps 7.2.0)** - Used to display interactive maps, show user location, display nearby drivers, and provide route visualization. This is essential for a ride-sharing application to function properly.
- **Google Maps JavaScript API** - Used for geocoding (converting addresses to coordinates and vice versa) and route calculations.
- **Capacitor Geolocation Plugin** - Used to access device GPS for real-time location tracking, which is critical for ride matching and driver tracking.

### **Authentication & Social Login**
- **Google Sign-In SDK (iOS/Android native)** - Enables users to authenticate using their Google account, providing a convenient login option.
- **Capacitor Social Login Plugin (@capgo/capacitor-social-login 7.5.9)** - Provides social authentication capabilities for Google and Facebook login, improving user onboarding experience.

### **Payment Processing**
- **Razorpay SDK** - Payment gateway integration that enables secure online payments (credit cards, debit cards, UPI, wallets) for ride bookings. This is essential for processing ride payments.

### **Real-Time Communication**
- **Socket.IO Client (socket.io-client 4.8.1)** - Enables real-time bidirectional communication between the app and our backend server for ride status updates, driver location tracking, and instant notifications.
- **ngx-socket-io (4.9.1)** - Angular wrapper for Socket.IO that integrates real-time communication with our Angular application.

### **UI & User Experience**
- **Ionic Framework 8.0.0** - Mobile UI framework that provides native-like components and navigation patterns.
- **Ionicons 7.0.0** - Icon library for consistent UI design.
- **Canvas Confetti (1.9.3)** - Used for celebration animations after successful ride completion, enhancing user engagement.

### **Local Storage & State Management**
- **Ionic Storage Angular (4.0.0)** - Provides local data persistence for user preferences, authentication tokens, and offline ride data.
- **RxJS 7.8.0** - Reactive programming library for managing application state and data streams.

### **Internationalization**
- **ngx-translate (16.0.4)** - Enables multi-language support (English, Hindi, Marathi) to serve diverse user bases.

### **Device Features**
- **Capacitor App Plugin** - Access to app lifecycle events and device information.
- **Capacitor Device Plugin** - Access to device information (model, OS version, etc.).
- **Capacitor Keyboard Plugin** - Handles keyboard events and behavior.
- **Capacitor Local Notifications Plugin** - Sends local push notifications for ride updates.
- **Capacitor Network Plugin** - Monitors network connectivity status.
- **Capacitor Status Bar Plugin** - Controls device status bar appearance.
- **Capacitor Haptics Plugin** - Provides tactile feedback for user interactions.

### **Development & Build Tools**
- **Angular 19.0.0** - Application framework for building the web-based UI.
- **TypeScript 5.6.3** - Type-safe programming language.
- **Date-fns (4.1.0)** - Date manipulation library for formatting ride timestamps and durations.

---

## Question 2: Explain how you ensure that any 3rd party code and SDKs used in your app comply with our policies.

**Response:**

We ensure compliance with Google Play Developer Program policies through the following measures:

### **1. SDK Selection & Vetting Process**
- **Official Sources Only**: We exclusively use SDKs from official, reputable sources:
  - Google Maps SDK from Google's official Capacitor plugin
  - Razorpay SDK from Razorpay's official documentation
  - Capacitor plugins from the official Capacitor ecosystem
  - Socket.IO from the official npm registry
- **Version Control**: All SDK versions are locked in `package.json` and `package-lock.json` to prevent unauthorized updates.
- **Regular Updates**: We regularly review and update SDKs to the latest stable versions that comply with current policies.

### **2. Data Collection & Privacy Compliance**
- **Minimal Data Collection**: We only collect user data that is strictly necessary for app functionality:
  - Location data: Required for ride matching and navigation (explicitly requested with clear permission dialogs)
  - Payment information: Processed securely through Razorpay's PCI-DSS compliant infrastructure (we do not store payment card details)
  - Authentication data: Stored securely using Ionic Storage with encryption
- **User Consent**: All data collection requires explicit user consent through:
  - Location permission dialogs with clear explanations
  - Privacy policy acceptance during registration
  - Transparent data usage in our privacy policy
- **No Unnecessary Tracking**: We do not use analytics SDKs, advertising SDKs, or any third-party tracking libraries that collect user data without explicit purpose.

### **3. SDK Configuration & Security**
- **API Key Security**: 
  - Google Maps API keys are stored securely in environment files (not in source code)
  - API keys are restricted to specific app bundle IDs and IP addresses
  - Keys are rotated regularly
- **Secure Communication**: 
  - All API calls use HTTPS/TLS encryption
  - Socket.IO connections use secure WebSocket (WSS) protocol
  - Payment data is transmitted only through Razorpay's secure payment gateway
- **No Code Obfuscation Issues**: We do not use ProGuard or code obfuscation that could hide malicious code.

### **4. Third-Party SDK Compliance Verification**
- **Google Maps SDK**: 
  - Official Google SDK with documented compliance
  - Used only for map display and geocoding (no data collection beyond location services)
  - Complies with Google Maps Platform Terms of Service
- **Razorpay SDK**: 
  - PCI-DSS Level 1 certified payment processor
  - Complies with RBI (Reserve Bank of India) regulations for payment gateways
  - All payment data is handled by Razorpay's secure infrastructure
- **Socket.IO**: 
  - Open-source library with transparent codebase
  - Used only for real-time communication (no data collection)
  - All data transmitted is encrypted via WSS
- **Capacitor Plugins**: 
  - Official plugins from the Capacitor team
  - Open-source with transparent code
  - No hidden data collection or tracking

### **5. Code Review & Audit Process**
- **Regular Audits**: We conduct regular code reviews to ensure no unauthorized SDKs or code are added
- **Dependency Scanning**: We use `npm audit` to check for known vulnerabilities in dependencies
- **Source Control**: All code changes are tracked in version control, preventing unauthorized modifications
- **Build Verification**: We verify that only approved dependencies are included in production builds

### **6. User Data Protection**
- **Local Storage**: User data stored locally uses Ionic Storage with encryption
- **No Data Sharing**: We do not share user data with third parties except:
  - Payment processing (Razorpay) - only transaction data necessary for payment
  - Location services (Google Maps) - only location data necessary for map display
- **Data Minimization**: We collect and store only the minimum data required for app functionality
- **User Rights**: Users can request data deletion, which we honor within 30 days

### **7. Policy Compliance Monitoring**
- **Regular Policy Review**: We regularly review Google Play Developer Program policies to ensure ongoing compliance
- **SDK Updates**: When SDKs are updated, we verify that new versions maintain compliance
- **Incident Response**: We have procedures to quickly remove or replace any SDK that violates policies

### **8. Transparency**
- **Privacy Policy**: Our privacy policy clearly discloses all data collection practices and third-party SDKs used
- **Terms of Service**: Our terms of service outline acceptable use and data handling practices
- **User Communication**: We provide clear information about data usage in-app and through our privacy policy

### **9. No Prohibited SDKs**
We confirm that our app does NOT use:
- SDKs that collect data without user consent
- SDKs that share data with unauthorized third parties
- SDKs that violate user privacy
- SDKs that contain malware or malicious code
- Unauthorized or modified versions of official SDKs

---

## Additional Notes for Google Play Console

**App Purpose**: Cerca is a ride-sharing application that connects riders with drivers. All SDKs are used exclusively for core app functionality (maps, payments, authentication, real-time communication).

**Data Collection Justification**: 
- Location data is essential for ride matching and navigation
- Payment data is necessary for processing ride payments
- Authentication data is required for user account management

**Compliance Commitment**: We are committed to maintaining full compliance with Google Play Developer Program policies and will promptly address any compliance issues that arise.

