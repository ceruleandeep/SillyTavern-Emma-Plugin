const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const serverConfig = {
    devtool: false,
    target: 'node',
    entry: './src/index.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'plugin.js',
        libraryTarget: 'commonjs',
        libraryExport: 'default',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: 'src/skeletons',
                    to: 'skeletons',
                    transform: {
                        transformer: (content) => content,
                        cache: true,
                    },
                    info: {
                        minimized: true // Prevents webpack from trying to minimize these files
                    }
                },
            ],
        }),
    ],
};

module.exports = [serverConfig];
