const appJson = require('./app.json');

const expo = appJson.expo ?? {};

module.exports = ({ config }) => ({
  ...config,
  ...expo,
  extra: {
    ...(expo.extra ?? {}),
    apiUrl: process.env.EXPO_PUBLIC_API_URL || expo.extra?.apiUrl || 'http://localhost:4000',
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || expo.extra?.eas?.projectId || ''
    }
  }
});
