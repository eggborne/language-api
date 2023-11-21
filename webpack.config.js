const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: isProduction ? 'production' : 'development',

    entry: ['./client/scripts.ts', 'webpack-hot-middleware/client'],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.client.json')
            }
          },
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './client/index.html', // Path to your source index.html
        filename: 'index.html' // Output file in /public directory
      }),
      new webpack.HotModuleReplacementPlugin(),
      isProduction && new MiniCssExtractPlugin()
    ].filter(Boolean),
    optimization: {
      minimize: isProduction,
      minimizer: [new TerserPlugin()],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'public'),
      publicPath: '/'
    }
  };
};
