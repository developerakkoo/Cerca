/**
 * Keeps iOS launch safe when GoogleService-Info.plist is not in the bundle yet.
 * @capacitor-firebase/messaging configures Firebase in plugin load(); without the
 * plist that call aborts the app. Re-applied after npm install.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', '@capacitor-firebase', 'messaging', 'ios', 'Plugin');
const messaging = path.join(root, 'FirebaseMessaging.swift');
const plugin = path.join(root, 'FirebaseMessagingPlugin.swift');

function replaceOnce(file, from, to) {
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    console.warn(`[guard-ios-fcm] pattern missing in ${path.basename(file)}`);
    return;
  }
  fs.writeFileSync(file, source.replace(from, to));
}

replaceOnce(
  messaging,
  `        super.init()
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        UIApplication.shared.registerForRemoteNotifications()
        Messaging.messaging().delegate = self
        self.plugin.bridge?.notificationRouter.pushNotificationHandler = self`,
  `        super.init()
        // Cerca: skip FCM setup until GoogleService-Info.plist is in the app bundle.
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            CAPLog.print("[FirebaseMessaging] GoogleService-Info.plist is missing. Push is disabled.")
            return
        }
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        UIApplication.shared.registerForRemoteNotifications()
        Messaging.messaging().delegate = self
        self.plugin.bridge?.notificationRouter.pushNotificationHandler = self`,
);

replaceOnce(
  messaging,
  `    public func getToken(completion: @escaping (String?, Error?) -> Void) {
        Messaging.messaging().isAutoInitEnabled = true`,
  `    public func getToken(completion: @escaping (String?, Error?) -> Void) {
        guard FirebaseApp.app() != nil else {
            completion(nil, NSError(domain: "FirebaseMessaging", code: 1, userInfo: [NSLocalizedDescriptionKey: "GoogleService-Info.plist is missing"]))
            return
        }
        Messaging.messaging().isAutoInitEnabled = true`,
);

replaceOnce(
  messaging,
  `    public func deleteToken(completion: @escaping (Error?) -> Void) {
        Messaging.messaging().deleteToken(completion: { error in`,
  `    public func deleteToken(completion: @escaping (Error?) -> Void) {
        guard FirebaseApp.app() != nil else {
            completion(nil)
            return
        }
        Messaging.messaging().deleteToken(completion: { error in`,
);

replaceOnce(
  messaging,
  `    public func handleRemoteNotificationReceived(notification: NSNotification) {
        if let userInfo = notification.userInfo {
            Messaging.messaging().appDidReceiveMessage(userInfo)
        }`,
  `    public func handleRemoteNotificationReceived(notification: NSNotification) {
        if FirebaseApp.app() != nil, let userInfo = notification.userInfo {
            Messaging.messaging().appDidReceiveMessage(userInfo)
        }`,
);

replaceOnce(
  plugin,
  `    @objc private func didRegisterForRemoteNotifications(notification: NSNotification) {
        guard let deviceToken = notification.object as? Data else {
            return
        }
        Messaging.messaging().apnsToken = deviceToken
    }`,
  `    @objc private func didRegisterForRemoteNotifications(notification: NSNotification) {
        guard FirebaseApp.app() != nil, let deviceToken = notification.object as? Data else {
            return
        }
        Messaging.messaging().apnsToken = deviceToken
    }`,
);
