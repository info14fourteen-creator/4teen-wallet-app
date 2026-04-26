const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);
const nobleCryptoShimPath = require.resolve('@noble/hashes/crypto');

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
  },
  resolveRequest: (context, moduleName, platform) => {
    const rewrittenModuleName =
      moduleName === '@noble/hashes/crypto.js' ? nobleCryptoShimPath : moduleName;

    return resolve(context, rewrittenModuleName, platform);
  },
};

module.exports = config;
