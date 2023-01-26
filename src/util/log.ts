import type { OutputChannel, Disposable } from 'coc.nvim';
import { window } from 'coc.nvim';
import util from 'util';
import { isTest } from './env';

type AsyncCatchFn = (...args: any) => any | Promise<any>;

const levelList = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'off',
] as const;
const levelErrorNum = levelList.indexOf('error');

type LevelStatus = (typeof levelList)[number];
type LevelLog = Exclude<LevelStatus, 'off'>;

function formatDate(date: Date) {
  return `${date.toLocaleString()} ${date
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`;
}

export class HelperLogger implements Disposable {
  private outputChannel_?: OutputChannel;
  private timeMarkers: Map<string, number> = new Map();
  private levelStatus: LevelStatus = 'trace';
  private levelNumber: number = levelList.indexOf(this.levelStatus);
  constructor(public readonly channelName: string) {}

  /**
   * Default level is 'trace'
   */
  set level(level: LevelStatus) {
    this.levelStatus = level;
    this.levelNumber = levelList[level];
  }

  get level() {
    return this.levelStatus;
  }

  dispose() {
    this.outputChannel_?.dispose();
  }

  get outputChannel() {
    if (!this.outputChannel_) {
      this.outputChannel_ = window.createOutputChannel(this.channelName);
    }
    return this.outputChannel_;
  }

  appendLine = (line: string) => {
    this.outputChannel.appendLine(line);
  };

  appendErrorLine = (line: string) => {
    if (isTest) {
      console.error(line);
    } else {
      void window.showErrorMessage(line);
    }
  };

  log = (levelName: LevelLog, data: string | Error) => {
    const levelNum: number = levelList[levelName];
    if (levelNum < this.levelNumber) {
      return;
    }

    const prefix = `[${formatDate(new Date())}] [${levelName}]: `;

    if (data instanceof Error) {
      this.appendLine(`${prefix}${data.stack ?? data.toString()}`);

      this.appendErrorLine(data.message);
      // this.outputChannel?.appendLine(data.stack ?? data.toString());
      if (isTest) {
        console.error(data.stack ?? data.toString());
      }
      return;
    }

    this.appendLine(`${prefix}${data}`);

    if (levelNum > levelErrorNum) {
      this.appendErrorLine(data);
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(data);
      }
    }
  };

  trace = (line: string) => {
    this.log('trace', line);
  };

  debug = (line: string) => {
    this.log('debug', line);
  };

  info = (line: string) => {
    this.log('info', line);
  };

  warn = (line: string) => {
    this.log('warn', line);
  };

  /**
   * Log and print error
   */
  error = (data: any) => {
    if (!(data instanceof Error)) {
      data = new Error(data);
    }
    this.log('error', data);
  };

  fatal = (data: any) => {
    this.log('fatal', data);
  };

  time(label = 'default') {
    this.timeMarkers.set(label, new Date().valueOf());
  }

  /**
   * @returns milliseconds
   */
  timeElapsed(label = 'default') {
    const time = this.timeMarkers.get(label);
    if (time !== undefined) {
      return new Date().valueOf() - time;
    }
  }

  timeLog(label = 'default') {
    const time = this.timeElapsed(label);
    if (time !== undefined) {
      this.appendLine(`${label}: ${time} ms`);
    }
  }

  /**
   * Executes the task and returns task result and elapsed time in milliseconds.
   * @returns [taskResult, milliseconds]
   */
  measureTime<T>(
    task: () => Promise<T>,
  ): Promise<[taskResult: T, milliseconds: number]>;
  measureTime<T>(task: () => T): [taskResult: T, milliseconds: number];
  measureTime<T>(
    task: () => T | Promise<T>,
  ):
    | [taskResult: T, milliseconds: number]
    | Promise<[taskResult: T, milliseconds: number]> {
    const time = new Date().valueOf();
    const result = task();
    if (result instanceof Promise) {
      return result.then((r) => {
        return [r, new Date().valueOf() - time];
      });
    }
    return [result, new Date().valueOf() - time];
  }

  /**
   * Executes the task and returns elapsed time in milliseconds.
   * @returns taskResult
   */
  measureTask<T>(
    task: () => Promise<T>,
    label?: string,
    level?: LevelLog,
  ): Promise<T>;
  measureTask<T>(task: () => T, label?: string, level?: LevelLog): T;
  measureTask<T>(
    task: () => T | Promise<T>,
    label = 'default',
    level: LevelLog = 'info',
  ): T | Promise<T> {
    const response = this.measureTime(task) as
      | [T, number]
      | Promise<[T, number]>;
    if (!('then' in response)) {
      const [result, time] = response;
      this.log(level, `[measureTask] ${label}: ${time} ms`);
      return result;
    }
    return response.then(([result, time]) => {
      this.log(level, `${label}: ${time} ms`);
      return result;
    });
  }

  /**
   * Wrap the async function and catch the error
   */
  asyncCatch(fn: AsyncCatchFn): AsyncCatchFn {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        this.error(e as Error);
      }
    };
  }

  /**
   * Print data to outputChannel and vim message
   */
  prettyPrint = (...data: unknown[]) => {
    this.info(prettyObject(...data));
    this.appendErrorLine(
      `[${formatDate(new Date())}] ${prettyObject(...data)}`,
    );
  };
}

export const helperLogger = new HelperLogger('coc-helper');

export function prettyObject(...data: unknown[]): string {
  return data.map((d) => util.inspect(d)).join(' ');
}

export function prettyPrint(...data: unknown[]) {
  helperLogger.prettyPrint(...data);
}
