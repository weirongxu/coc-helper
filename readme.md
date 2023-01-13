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

### HelperLogger

Logger with OutputChannel support

```typescript
import { ExtensionContext } from 'coc.nvim';
import { HelperLogger } from 'coc-helper';
const logger = new HelperLogger('extensionChannelName');

// OutputChannel
const channel = logger.outputChannel;

function activate(context: ExtensionContext) {
  // Change level
  logger.level = isDebug ? 'debug' : 'info';
}

async function stuff() {
  logger.info('info');
  logger.warn('info');
  // Log and print error
  logger.error('error');

  logger.prettyPrint({ token: 'xxx', data: 'foo' });

  const [jobReturn, elapsedMilliseconds] = logger.measureTime(async () => {
    return await asyncJobs();
  });

  await helperLogger.measureTask(async () => {
    await asyncJobs();
  }, 'job name');
}
```

### HelperEventEmitter

Typed events emitter

```typescript
import { HelperEventEmitter, HelperLogger } from 'coc-helper';
const logger = new HelperLogger('extensionChannelName');

interface Events {
  foo: (foo: number) => void;
  bar: (bar: string) => Promise<void>;
}

const events = new HelperEventEmitter(logger);
events.on('foo', (foo) => {});
events.fire('foo', 1);
```

### WinLayoutFinder

Find the vim window by `winlayout()`

```typescript
import { WinLayoutFinder } from 'coc-helper';

const winFinder = WinLayoutFinder.create(tabnr);
const leaf = winFinder.find(winid);
// Parent
const parent = leaf.parent;
// Group type, 'col' or 'row'
const parentType = parent.group.type;
// Siblings
const siblings = parent.group.children;
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
