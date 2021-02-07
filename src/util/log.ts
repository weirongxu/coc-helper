import { OutputChannel, window, Disposable } from 'coc.nvim';
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

type LevelStatus = typeof levelList[number];
type LevelLog = Exclude<LevelStatus, 'off'>;

function formatDate(date: Date) {
  return `${date.toLocaleString()} ${date.getMilliseconds()}`;
}

export class HelperLogger implements Disposable {
  private outputChannel_?: OutputChannel;
  private timeMarkers: Map<string, number> = new Map();
  private levelStatus: LevelStatus = 'trace';
  private levelNumber: number = levelList.indexOf(this.levelStatus);
  constructor(public readonly channelName: string) {
    this.appendLine = this.appendLine.bind(this);
    this.log = this.log.bind(this);
    this.trace = this.trace.bind(this);
    this.debug = this.debug.bind(this);
    this.info = this.info.bind(this);
    this.warn = this.warn.bind(this);
    this.error = this.error.bind(this);
    this.fatal = this.fatal.bind(this);
  }

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

  appendLine(line: string) {
    this.outputChannel.appendLine(line);
  }

  log(levelName: LevelLog, data: string | Error) {
    const levelNum: number = levelList[levelName];
    if (levelNum < this.levelNumber) {
      return;
    }

    const prefix = `[${formatDate(new Date())}] [${levelName}]: `;

    if (data instanceof Error) {
      this.appendLine(`${prefix}${data.stack ?? data.toString()}`);

      // eslint-disable-next-line no-restricted-properties
      window.showMessage(data.message, 'error');
      // this.outputChannel?.appendLine(data.stack ?? data.toString());
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(data.stack ?? data.toString());
      }
      return;
    }

    this.appendLine(`${prefix}${data}`);

    if (levelNum > levelErrorNum) {
      // eslint-disable-next-line no-restricted-properties
      window.showMessage(data, 'error');
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(data);
      }
    }
  }

  trace(line: string) {
    this.log('trace', line);
  }

  debug(line: string) {
    this.log('debug', line);
  }

  info(line: string) {
    this.log('info', line);
  }

  warn(line: string) {
    this.log('warn', line);
  }

  error(data: string | Error) {
    this.log('error', data);
  }

  fatal(data: string | Error) {
    this.log('fatal', data);
  }

  time(label: string = 'default') {
    this.timeMarkers.set(label, new Date().valueOf());
  }

  /**
   * @returns milliseconds
   */
  timeElapsed(label: string = 'default') {
    const time = this.timeMarkers.get(label);
    if (time !== undefined) {
      return new Date().valueOf() - time;
    }
  }

  timeLog(label: string = 'default') {
    const time = this.timeElapsed(label);
    if (time !== undefined) {
      this.appendLine(`${label}: ${time} ms`);
    }
  }

  measureTime<T>(task: () => Promise<T>): Promise<[T, number]>;
  measureTime<T>(task: () => T): [T, number];
  measureTime<T>(
    task: () => T | Promise<T>,
  ): [T, number] | Promise<[T, number]> {
    const time = new Date().valueOf();
    const result = task();
    if (!('then' in result)) {
      return [result, new Date().valueOf() - time];
    }
    return result.then((r) => {
      return [r, new Date().valueOf() - time];
    });
  }

  measureTask<T>(
    task: () => Promise<T>,
    label?: string,
    level?: LevelLog,
  ): Promise<T>;
  measureTask<T>(task: () => T, label?: string, level?: LevelLog): T;
  measureTask<T>(
    task: () => T | Promise<T>,
    label: string = 'default',
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
        this.error(e);
      }
    };
  }
}

export const helperLogger = new HelperLogger('coc-helper');

export function prettyObject(...data: any[]): string {
  return data.map((d) => util.inspect(d)).join(' ');
}

export function prettyPrint(...data: any[]) {
  helperLogger.info(prettyObject(...data));
  // eslint-disable-next-line no-restricted-properties
  window.showMessage(`${formatDate(new Date())}${prettyObject(...data)}`);
}
