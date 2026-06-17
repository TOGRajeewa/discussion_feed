// Standalone (classic-page) bundle. Produces ONE self-contained JS file that
// renders the same React feed as the SPFx web part, with no SPFx runtime.
// Run with Node 8 on PATH:  npm run build:standalone
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/standalone/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist-standalone'),
    filename: 'discussion-feed.bundle.js',
    library: 'DiscussionFeedApp',     // window.DiscussionFeedApp.render({...})
    libraryTarget: 'window'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      // No SPFx runtime on a classic page — swap sp-http for the lightweight stub.
      '@microsoft/sp-http$': path.resolve(__dirname, 'src/standalone/sp-http-stub.ts')
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{
          loader: 'ts-loader',
          options: {
            transpileOnly: true,            // skip cross-lib type checking (Fluent v5 etc.)
            compilerOptions: { module: 'esnext', declaration: false, jsx: 'react' }
          }
        }]
      },
      {
        // CSS-modules for our component styles -> injected at runtime by style-loader
        test: /\.module\.scss$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: { modules: true, localIdentName: 'df_[local]_[hash:base64:5]', importLoaders: 1 }
          },
          'sass-loader'
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        // TinyMCE ships font/image assets referenced by its CSS skin (loaded at runtime)
        test: /\.(woff|woff2|eot|ttf|svg|gif|png)$/,
        use: [{ loader: 'file-loader', options: { name: 'assets/[name].[ext]' } }]
      }
    ]
  },
  performance: { hints: false },
  stats: { children: false, modules: false }
};
