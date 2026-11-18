import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.a2gestao.app',
  appName: 'A2 Gestão',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'com.a2gestao.app'
    }
  }
};

export default config;
