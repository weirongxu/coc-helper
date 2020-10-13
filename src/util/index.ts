export * from './env';
export * from './log';
export * from './collection';
export * from './text';
export * from './version';

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
