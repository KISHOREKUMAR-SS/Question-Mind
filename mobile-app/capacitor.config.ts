import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.krishacademia.questionmind',
  appName: 'Question Mind',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
