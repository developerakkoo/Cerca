import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.techlapse.Cerca',
  appName: 'Cerca',
  webDir: 'www',
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#333652",
      sound: "beep.wav",
    },
  },
};

export default config;
