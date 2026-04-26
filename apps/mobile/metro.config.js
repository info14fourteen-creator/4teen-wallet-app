const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');
const path = require('path');

const config = getDefaultConfig(__dirname);
const nobleCryptoShimPath = require.resolve('@noble/hashes/crypto');
const lottieReactNativePath = path.dirname(require.resolve('lottie-react-native/package.json'));

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  extraNodeModules: {
    ...(config.resolver.extraNodeModules || {}),
    '@noble/hashes/crypto.js': nobleCryptoShimPath,
    'lottie-react-native': lottieReactNativePath,
  },
  resolveRequest: (context, moduleName, platform) => {
    const rewrittenModuleName =
      moduleName === '@noble/hashes/crypto.js'
        ? nobleCryptoShimPath
        : moduleName === 'lottie-react-native'
          ? lottieReactNativePath
          : moduleName;

    return resolve(context, rewrittenModuleName, platform);
  },
};

module.exports = config;
