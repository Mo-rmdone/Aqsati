jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Lucide ships ESM-only (.mjs); icons are decoration in logic tests, so render nothing.
jest.mock('lucide-react-native', () => new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? t[k] : () => null) }));
