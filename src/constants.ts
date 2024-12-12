import path from 'node:path';

export const PUBLIC_DIRECTORIES = {
    images: 'public/img/',
    backups: 'backups/',
    sounds: 'public/sounds',
    extensions: 'public/scripts/extensions',
    globalExtensions: 'public/scripts/extensions/third-party',
};

export const PLUGIN_DIRECTORIES = {
    skeletons: path.join(__dirname, 'skeletons'),
};
