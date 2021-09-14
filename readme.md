# coc-helper

Helpers for coc.nvim

## Used by

- [coc-floatinput](https://github.com/weirongxu/coc-floatinput)
- [coc-explorer](https://github.com/weirongxu/coc-explorer)
- [coc-webview](https://github.com/weirongxu/coc-webview)

## Usage

### activateHelper

- **Note: Only some modules need to call activateHelper, as noted in the documentation below.**

```typescript
import { activateHelper } from 'coc-helper';

export async function activate(context: ExtensionContext) {
  await activateHelper(context);
}
```

### VimModule

Used to create some vim modules, but avoid in autoload.

- Required activateHelper
- **NOTE**: `VimModule.create()` must be called before `activateHelper()`, otherwise you need to call `VimModule.init()` before using.

```typescript
import { VimModule } from 'coc-helper';

// create module
const utilMod = VimModule.create('util', (mod) => {
  // internal function
  const screenPos = mod.fn<[nr: number], [row: number, col: number]>(
    'screen_pos',
    ({ name }) => `
      function! ${name}(nr)
      return win_screenpos(a:nr)
      endfunction
    `,
  );

  return {
    // export function
    globalCursorPosition: mod.fn<[], [number, number]>(
      'global_cursor_position',
      ({ name }) => `
        function! ${name}()
          let nr = winnr()
          let [row, col] = {screenPos.inlineCall('nr')}
          return [row + winline() - 2, col + wincol() - 2]
        endfunction
      `,
    ),
  };
});
```

- VimModule.create: Create a vim module.
- VimModule.prototype.fn: Create a vim function.

### FloatingWindow

Create a floating window.

- Required activateHelper
- Support border and padding.
- Supported relative: cursor-around, cursor, center, editor.

```typescript
import { FloatingWindow, sleep } from 'coc-helper';

function displayStuff() {
  // FloatingWindow create
  const floatWin = await FloatingWindow.create({
    mode: 'base',
  });
  // FloatingWindow open
  await floatWin.open({
    relative: 'cursor-around',
    lines: ['hello'],
    top: 0,
    left: 0,
    title: 'test',
    width: 5,
    height: 5,
    border: [1, 1, 1, 0],
    padding: [],
  });
  await sleep(2000);
  // FloatingWindow resize
  await floatWin.resize({
    relative: 'cursor-around',
    top: 0,
    left: 0,
    title: 'test',
    width: 10,
    height: 10,
    border: [],
    padding: [],
    modifiable: true,
    winHl: 'WinHL',
    borderWinHl: 'WinHLB',
    focus: false,
    filetype: 'test',
  });
}
```

[More complete example](./src/index.ts)

### MultiFloatingWindow

Create the multi floating window.

- Required activateHelper

```typescript
import { MultiFloatingWindow, sleep } from 'coc-helper';

function displayStuff() {
  // create
  const multiFloatWin = await MultiFloatingWindow.create({
    wins: {
      prompt: { mode: 'show' },
      input: { mode: 'base' },
    },
  });
  const width = 10;
  // open
  await multiFloatWin.open({
    relative: 'cursor-around',
    top: 0,
    left: 0,
    title: 'test',
    width,
    border: [],
    padding: [],
    modifiable: true,
    filetype: 'test',
    wins: {
      prompt: {
        top: 0,
        left: 0,
        width,
        height: 1,
        lines: ['prompt:'],
        highlights: [
          {
            line: 0,
            srcId: 0,
            colEnd: -1,
            colStart: 0,
            hlGroup: 'Question',
          },
        ],
      },
      input: {
        top: 1,
        left: 0,
        width,
        height: 1,
        focus: true,
        modifiable: true,
      },
    },
  });
  await sleep(2000);
  // resize
  await multiFloatWin.resize(...);
}
```

[More complete example](./src/index.ts)

### Notifier

Combine the notify of coc.nvim

```typescript
import { Notifier } from 'coc-helper';
import { workspace } from 'coc.nvim';

const { nvim } = workspace;

// create
const callNotifier = Notifier.create(() => {
  nvim.call('func', true);
  nvim.call('func2', true);
});

const callNotifier2 = Notifier.create(() => {
  nvim.call('func3', true);
});

// combine
const callNotifierCombined = callNotifier.concat(callNotifier2);
const callNotifierCombined2 = Notifier.combine([callNotifier, callNotifier2]);

async function fetchNotifier() {
  return callNotifier;
}

// run
await callNotifierCombined.run();
await Notifier.run(fetchNotifier());
await Notifier.runAll([fetchNotifier(), callNotifierCombined]);

// notify
nvim.pauseNotification();
(await fetchNotifier()).notify();
Notifier.notifyAll([callNotifierCombined, callNotifier2]);
callNotifierCombined.notify();
await nvim.resumeNotification();
```

### HelperEventEmitter

```typescript
import { HelperEventEmitter, HelperLogger } from 'coc-helper';
const logger = new HelperLogger('yourChannelName');

interface Events {
  foo: (foo: number) => void;
  bar: (bar: string) => Promise<void>;
}

const events = new HelperEventEmitter(logger);
events.on('foo', (foo) => {});
events.fire('foo', 1);
```

### Jest setup and CI

jest.config.json

```javascript
const jest = require('./node_modules/coc-helper/jest.config.js');

module.exports = {
  ...jest,
  // your jest configuration in here
  // clearMocks: true,
  // moduleNameMapper: {
  //   ...jest.moduleNameMapper,
  //   '^lodash-es$': 'lodash',
  // },
};
```

[github ci workflows](./.github/workflows/ci.yml)
