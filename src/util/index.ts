export * from './collection';
export * from './config';
export * from './env';
export * from './log';
export * from './text';
export * from './version';
export * from './vim';

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
