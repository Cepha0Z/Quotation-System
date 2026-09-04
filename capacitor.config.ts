import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nebulous.quotationsystem',
  appName: 'Quotation System',
  server: {
    url: 'https://interix-quotation-studio.cephajj.chatgpt.site',
    cleartext: false
  }
};

export default config;