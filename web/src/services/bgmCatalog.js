export const bgmModules = import.meta.glob('../../../bgm/*.mp3', { eager: true, query: '?url', import: 'default' });
