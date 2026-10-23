import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.techlapse.Cerca',
  appName: 'Cerca',
  webDir: 'www',
  ios: {
    contentInset: 'automatic',
  },
  server: {
    allowNavigation: ['*.razorpay.com'],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#333652",
    },
    GoogleMaps: {
      forceCompile: true
    }
  },
};

export default config;
