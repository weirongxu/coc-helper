import { workspace } from 'coc.nvim';
import { Notifier } from './notifier';
import { outputChannel, helperOnError, versionName } from './util';

const pid = process.pid;
const globalKey = `coc_helper_module_p${pid}_${versionName}`;
const globalVariable = `g:${globalKey}`;
const callFunc = `CocHelperCallFn_${versionName}`;
const declareVar = `CocHelperCallVar_${versionName}`;

const globalModuleIdKey = '__coc_helper_module_max_id';
function getModuleId(): number {
  if (!(globalModuleIdKey in global)) {
    global[globalModuleIdKey] = 0;
  }
  global[globalModuleIdKey] += 1;
  return global[globalModuleIdKey];
}

function filterLineCont(content: string) {
  return content.replace(/\n\s*\\/g, '');
}

export namespace VimModule {
  export type FnCaller<Args extends any[], R> = {
    name: string;
    inlineCall: (argsExpression?: string) => string;
    call: (...args: Args) => Promise<R>;
    callNotify: (...args: Args) => void;
    callNotifier: (...args: Args) => Notifier;
  };

  export type Var<V> = {
    name: string;
    inline: string;
    get: () => Promise<V>;
    set: (expression: string) => Promise<void>;
    setNotify: (expression: string) => void;
    setNotifier: (expression: string) => Notifier;
  };

  export type Context = { name: string };
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
            let msg = 'error when call ' . a:module_key . '.' . a:method_name
            echom msg
            echom ex
            throw msg . ex
          endtry
        endfunction

        function! ${declareVar}(module_key, var_name, expression)
          try
            let ${globalVariable}[a:module_key][a:var_name] = eval(a:expression)
          catch
            let ex = v:exception
            let msg = 'error when declare ' . a:module_key . '.' . a:var_name
            echom msg
            echom ex
            throw msg . ex
          endtry
        endfunction
      `,
    );

    while (VimModule.initQueue.length) {
      const fn = VimModule.initQueue.shift()!;
      await fn().catch(helperOnError);
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
      await workspace.nvim.call(
        'execute',
        `let ${globalVariable}.${moduleKey} = {}`,
      );
      initedMod();
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
    getContent: (ctx: VimModule.Context) => string,
  ): VimModule.FnCaller<Args, R> {
    const { nvim } = workspace;
    const name = `${globalVariable}.${this.moduleKey}.${fnName}`;
    const content = getContent({ name: name });
    const debugKey = `${this.moduleKey}.${fnName}`;
    VimModule.initQueue.push(async () => {
      outputChannel.appendLine(`declare fn ${debugKey}`);
      await nvim.call('execute', [filterLineCont(content)]);
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

  var<V>(varName: string, expression: string): VimModule.Var<V> {
    const { nvim } = workspace;
    const name = `${globalVariable}.${this.moduleKey}.${varName}`;
    const debugKey = `${this.moduleKey}.${varName}`;

    VimModule.initQueue.push(async () => {
      outputChannel.appendLine(`declare var ${debugKey}`);
      await nvim.call(declareVar, [
        this.moduleKey,
        varName,
        filterLineCont(expression),
      ]);
    });
    return {
      name,
      inline: name,
      get: () => {
        return nvim.eval(name) as Promise<V>;
      },
      set: async (expression: string) => {
        await nvim.call(declareVar, [
          this.moduleKey,
          varName,
          filterLineCont(expression),
        ]);
      },
      setNotify: (expression: string) => {
        nvim.call(
          declareVar,
          [this.moduleKey, varName, filterLineCont(expression)],
          true,
        );
      },
      setNotifier: (expression: string) => {
        return Notifier.create(() => {
          nvim.call(
            declareVar,
            [this.moduleKey, varName, filterLineCont(expression)],
            true,
          );
        });
      },
    };
  }
}
