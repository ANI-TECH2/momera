# Fix AsyncStorage window error in Expo + Supabase

## Steps:
- [x] 1. Create src/lib/storage.ts polyfill for AsyncStorage (RN/web/Node.js compatible)
- [x] 2. Update src/server/supabase.ts to use dynamic storage from polyfill
- [x] 3. Create metro.config.js with AsyncStorage web resolver alias
- [ ] 4. Run `npx expo install @react-native-async-storage/async-storage` to ensure compatibility
- [ ] 5. Test: `expo start --clear` (check no errors)
- [ ] 6. Test web: `expo start --web` (if targeting web)
- [x] Plan created and approved

Current: Step 4 complete. Testing with expo start --clear.

