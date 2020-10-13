export const compactI = <T>(arr: (T | undefined | null | void)[]): T[] =>
  arr.filter((it): it is T => it !== undefined && it !== null);

export const sum = (arr: number[]) => arr.reduce((total, cur) => total + cur);
