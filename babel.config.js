module.exports = {
  presets: ['next/babel'],
  plugins: [
    // Only run in development or when explicitly enabled
    ...(process.env.NODE_ENV === 'development' || process.env.ENABLE_DOM_ID === 'true'
      ? [require.resolve('./babel-plugin-dom-id.js')]
      : []),
  ],
};
