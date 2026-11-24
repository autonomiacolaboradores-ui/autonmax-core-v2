import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.autonmax.app',
  appName: 'AUTONMAX vNext',
  webDir: 'app-web/dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Autenticação Biométrica',
        biometricSubTitle: 'Confirme sua identidade para acessar o banco local',
      },
    },
  },
};

export default config;
