import { HelperEventEmitter } from './events';
import { helperLogger } from './util';

interface Events {
  foo: (foo: number) => void;
  bar: (bar: string) => Promise<void>;
}

const helperEvents = new HelperEventEmitter<Events>(helperLogger);

test('on foo', async () => {
  let store = 0;
  helperEvents.once('foo', async (bar) => {
    store = bar;
  });
  helperEvents.fire('foo', 1).catch(helperLogger.error);
  expect(store).toEqual(1);
});

test('on bar', async () => {
  let store = 'origin';
  helperEvents.once('bar', async (bar) => {
    store = bar;
  });
  await helperEvents.fire('bar', 'changed');
  expect(store).toEqual('changed');
});
