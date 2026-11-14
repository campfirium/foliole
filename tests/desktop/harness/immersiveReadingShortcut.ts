import process from 'node:process';

export const IMMERSIVE_READING_KEY = process.platform === 'darwin' ? 'Alt+r' : 'F11';
