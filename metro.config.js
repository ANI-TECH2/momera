const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname, {
  // Enable CSS support for Tailwind
  isCSSEnabled: true,
});

/** @type {import('expo/metro-config').MetroConfig} */
const finalConfig = {
  ...config,
  resolver: {
    ...config.resolver,
    // Alias for AsyncStorage on web to use react-native version (polyfilled)
    alias: {
      ...config.resolver.alias,
      '@react-native-async-storage/async-storage': '@react-native-async-storage/async-storage/react-native',
    },
    unstable_enableSymlinks: true,
    resolveRequest: (context, moduleName, platform) => {
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = finalConfig;

