const {
  EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY,
} = process.env;

export default {
  expo: {
    name: "Memora",
    slug: "memora",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "memora",
    splash: {
      resizeMode: "contain",
      backgroundColor: "#0D0F1A",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.memora.app",
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#0D0F1A",
      },
      package: "com.memora.app",
      permissions: ["android.permission.RECORD_AUDIO"],
    },
    web: {
      bundler: "metro",
      output: "server",
    },
    plugins: [
      "expo-router",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow Memora to access your photos for uploading images.",
        },
      ],
      "expo-document-picker",
      "expo-web-browser",
      "expo-sqlite",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "6319cd24-e3c9-4cfc-a2b9-a097311b2b4e",
      },
      expoPublicSupabaseUrl: EXPO_PUBLIC_SUPABASE_URL,
      expoPublicSupabaseAnonKey: EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};
