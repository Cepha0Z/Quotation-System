import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nebulous.quotationsystem',
  appName: 'Quotation System',
  webDir: 'dist/client',
  ios: {
    zoomEnabled: true,
    contentInset: 'never',
  },
};

export default config;
