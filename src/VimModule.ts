import type { ExtensionContext } from 'coc.nvim';
import { workspace } from 'coc.nvim';
import { Notifier } from './notifier';
import { helperLogger, versionName } from './util';
import { getModuleId } from './util/module';

const mid = getModuleId('VimModule');
const globalKey = `coc_helper_module_m${mid}_v${versionName}`;
const globalVariable = `g:${globalKey}`;
const callFunc = `CocHelperCallFn_m${mid}_v${versionName}`;
const declareVar = `CocHelperCallVar_m${mid}_v${versionName}`;

function filterLineCont(content: string) {
  return content.replace(/\n\s*\\/g, '');
}

/**
 * @deprecated Because VimModule will make the code difficult to debug
 */
export namespace VimModule {
  export type InitQueueFn = (context: ExtensionContext) => void | Promise<void>;

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

/**
 * @deprecated Because VimModule will make the code difficult to debug
 */
export class VimModule {
  static inited = false;

  static async init(context: ExtensionContext) {
    this.inited = true;
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
            let msg = printf('error when call %s.%s.%s, args: [%s]', '${globalVariable}', a:module_key, a:method_name, join(a:args, ','))
            echom msg
            echom ex
            throw msg . ' ' . ex
          endtry
        endfunction

        function! ${declareVar}(module_key, var_name, expression)
          try
            let ${globalVariable}[a:module_key][a:var_name] = eval(a:expression)
          catch
            let ex = v:exception
            let msg = printf('error when declare %s.%s.%s, expression: %s', '${globalVariable}', a:module_key, a:var_name, a:expression)
            echom msg
            echom ex
            throw msg . ' ' . ex
          endtry
        endfunction
      `,
    );

    const queue = [...this.initQueue];
    while (queue.length) {
      const it = queue.shift()!;
      try {
        await it.fn(context);
      } catch (error) {
        helperLogger.error(error);
      }
      if (this.initAfterQueue.length) {
        queue.push(...this.initAfterQueue);
        this.initAfterQueue = [];
      }
    }
  }

  private static initQueue: {
    description: string;
    fn: VimModule.InitQueueFn;
  }[] = [];
  private static initAfterQueue: {
    description: string;
    fn: VimModule.InitQueueFn;
  }[] = [];

  static registerInit(description: string, fn: VimModule.InitQueueFn) {
    if (!this.inited) {
      this.initQueue.push({ description, fn });
    } else {
      this.initAfterQueue.push({ description, fn });
    }
  }

  static create<T extends object>(
    moduleName: string,
    cb: (m: VimModule) => T,
  ): T {
    const id = getModuleId('VimModule.module');
    const moduleKey = `${id}_${moduleName}`;
    const vMod = new VimModule(moduleKey);
    let mod: T | undefined = undefined;

    function initedMod() {
      if (!mod) {
        mod = cb(vMod);
      }
      return mod;
    }

    VimModule.registerInit(`module ${moduleKey}`, async () => {
      await workspace.nvim.call(
        'execute',
        `
          if !exists('${globalVariable}.${moduleKey}')
            let ${globalVariable}.${moduleKey} = {}
          endif
        `,
      );
      initedMod();
    });

    return new Proxy(
      {},
      {
        get(_o, key) {
          return Reflect.get(initedMod(), key);
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

  /** @deprecated */
  registerInit(initFn: VimModule.InitQueueFn): void;
  registerInit(description: string, initFn: VimModule.InitQueueFn): void;
  registerInit(
    description: string | VimModule.InitQueueFn,
    fn?: VimModule.InitQueueFn,
  ) {
    if (typeof description === 'string') {
      return VimModule.registerInit(description, fn!);
    } else {
      return this.registerInit('', description);
    }
  }

  fn<Args extends any[], R>(
    fnName: string,
    getContent: (ctx: VimModule.Context) => string,
  ): VimModule.FnCaller<Args, R> {
    const { nvim } = workspace;
    const name = `${globalVariable}.${this.moduleKey}.${fnName}`;
    const content = getContent({ name });
    this.registerInit(`fn ${name}`, async () => {
      helperLogger.debug(`declare fn ${name}`);
      await nvim.call('execute', [filterLineCont(content)]);
    });
    return {
      name,
      inlineCall: (argsExpression = '') =>
        `${callFunc}('${this.moduleKey}', '${fnName}', [${argsExpression}])`,
      call: (...args: Args) => {
        helperLogger.debug(`call ${name}`);
        return nvim.call(callFunc, [
          this.moduleKey,
          fnName,
          args,
        ]) as Promise<R>;
      },
      callNotify: (...args: Args) => {
        helperLogger.debug(`callNotify ${name}`);
        return nvim.call(callFunc, [this.moduleKey, fnName, args], true);
      },
      callNotifier: (...args: Args) => {
        helperLogger.debug(`callNotifier ${name}`);
        return Notifier.create(() => {
          nvim.call(callFunc, [this.moduleKey, fnName, args], true);
        });
      },
    };
  }

  var<V>(varName: string, expression: string): VimModule.Var<V> {
    const { nvim } = workspace;
    const name = `${globalVariable}.${this.moduleKey}.${varName}`;

    this.registerInit(`var ${name}`, async () => {
      helperLogger.debug(`declare var ${name}`);
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
