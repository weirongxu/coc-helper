import { workspace } from 'coc.nvim';
import Pkg from '../package.json';
import { Notifier } from './notifier';
import { outputChannel, helperOnError } from './util';

const version = Pkg.version.replace(/[.-]/g, '_');
const pid = process.pid;
const globalKey = `coc_helper_module_p${pid}_${version}`;
const globalVariable = `g:${globalKey}`;
const callFunc = `CocHelperCall_${version}`;

const globalModuleIdKey = '__coc_helper_module_max_id';
function getModuleId(): number {
  if (!(globalModuleIdKey in global)) {
    global[globalModuleIdKey] = 0;
  }
  global[globalModuleIdKey] += 1;
  return global[globalModuleIdKey];
}

export namespace VimModule {
  export type FnCaller<Args extends any[], R> = {
    name: string;
    inlineCall: (argsExpression?: string) => string;
    call: (...args: Args) => Promise<R>;
    callNotify: (...args: Args) => void;
    callNotifier: (...args: Args) => Notifier;
  };

  export type FnContext = { name: string };
}

export class VimModule {
  static async init() {
    await workspace.nvim.call(
      'execute',
      `
        if !exists('${globalVariable}')
          let ${globalVariable} = {}
        endif

        function! ${callFunc}(module_key, method_name, args)
          try
            return call(${globalVariable}[a:module_key][a:method_name], a:args)
          catch
            let ex = v:exception
            echom "error at " . a:module_key . "." . a:method_name
            echom ex
            throw ex
          endtry
        endfunction
      `,
    );
    while (VimModule.initQueue.length) {
      const fn = VimModule.initQueue.shift()!;
      fn().catch(helperOnError);
    }
  }

  static initQueue: (() => Promise<void>)[] = [];

  static create<T extends object>(
    moduleName: string,
    cb: (m: VimModule) => T,
  ): T {
    const id = getModuleId();
    const moduleKey = `${id}_${moduleName}`;
    const vMod = new VimModule(moduleKey);
    let mod: T | undefined = undefined;

    function initedMod() {
      if (!mod) {
        mod = cb(vMod);
      }
      return mod;
    }

    VimModule.initQueue.push(async () => {
      initedMod();
      await workspace.nvim.call(
        'execute',
        `let ${globalVariable}.${moduleKey} = {}`,
      );
    });

    return new Proxy(
      {},
      {
        get(_o, key) {
          return Reflect.get(initedMod(), key);
        },
        enumerate() {
          return Object.keys(initedMod());
        },
        has(_o, key) {
          return key in initedMod();
        },
        ownKeys() {
          return Object.keys(initedMod());
        },
      },
    ) as T;
  }

  constructor(public moduleKey: string) {}

  fn<Args extends any[], R>(
    fnName: string,
    getContent: (ctx: VimModule.FnContext) => string,
  ): VimModule.FnCaller<Args, R> {
    const nvim = workspace.nvim;
    const name = `${globalVariable}.${this.moduleKey}.${fnName}`;
    const content = getContent({ name: name });
    const debugKey = `${this.moduleKey}.${fnName}`;
    VimModule.initQueue.push(async () => {
      outputChannel.appendLine(`declare ${debugKey}`);
      await nvim.call('execute', [content.replace(/\n\s*\\/g, '')]);
    });
    return {
      name,
      inlineCall: (argsExpression: string = '') =>
        `${callFunc}('${this.moduleKey}', '${fnName}', [${argsExpression}])`,
      call: (...args: Args) => {
        outputChannel.appendLine(`call ${debugKey}`);
        return nvim.call(callFunc, [this.moduleKey, fnName, args]) as Promise<
          R
        >;
      },
      callNotify: (...args: Args) => {
        outputChannel.appendLine(`callNotify ${debugKey}`);
        return nvim.call(callFunc, [this.moduleKey, fnName, args], true);
      },
      callNotifier: (...args: Args) => {
        outputChannel.appendLine(`callNotifier ${debugKey}`);
        return Notifier.create(() => {
          nvim.call(callFunc, [this.moduleKey, fnName, args], true);
        });
      },
    };
  }
}
