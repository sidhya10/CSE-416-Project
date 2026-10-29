import type { CapacitorConfig } from '@capacitor/cli';

// The iOS shell is intentionally separate from the Vercel deployment. It loads
// the existing HTTPS application so web and TestFlight users share the same
// API origin, sessions, and data without changing the web hosting setup.
const config: CapacitorConfig = {
  appId: 'com.cse416.personalgroupbudget',
  appName: 'CSE 416 Budget',
  webDir: 'client/dist',
  loggingBehavior: 'none',
  server: {
    url: 'https://cse-416-project-tau.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    scheme: 'CSE416Budget',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#f4f7f5',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#f4f7f5',
    },
  },
};

export default config;
