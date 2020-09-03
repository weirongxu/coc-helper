import { jestHelper } from './JestHelper';
import { FloatingWindow } from './FloatingWindow';
import { FloatingUtil } from './FloatingUtil';

jestHelper.boot();

function getFloatUtil(): FloatingWindow {
  // @ts-expect-error
  return new FloatingUtil(0, 0, {}, 'base', 0);
}

function getCtx(): FloatingUtil.Context {
  return {
    title: {
      text: 'test',
      width: 4,
    },
    lines: 50,
    columns: 50,
    globalCursorPosition: [3, 3],
    borderEnabled: true,
    border: [1, 1, 1, 0],
    paddingEnabled: true,
    padding: [1, 1, 1, 1],
  };
}

test('getCenterPos', () => {
  const f = getFloatUtil();
  const ctx = getCtx();
  // @ts-expect-error
  const pos = f.getCenterPos(ctx, [3, 3, 9, 9]);
  expect(pos).toEqual([20, 20]);
});

test('getPosForAround', () => {
  const f = getFloatUtil();
  const ctx = getCtx();
  let pos: FloatingUtil.Position;
  // @ts-expect-error
  pos = f.getPosForAround(ctx, [9, 9], [0, 0]);
  expect(pos).toEqual([1, 0]);
  // @ts-expect-error
  pos = f.getPosForAround(ctx, [9, 9], [41, 0]);
  expect(pos).toEqual([32, 0]);
  // @ts-expect-error
  pos = f.getPosForAround(ctx, [9, 9], [0, 41]);
  expect(pos).toEqual([1, 33]);
  // @ts-expect-error
  pos = f.getPosForAround(ctx, [9, 9], [41, 41]);
  expect(pos).toEqual([32, 33]);
  // @ts-expect-error
  pos = f.getPosForAround(ctx, [9, 9], [0, 0], true);
  expect(pos).toEqual([1, 0]);
  // @ts-expect-error
  pos = f.getPosForAround(ctx, [9, 9], [10, 10], true);
  expect(pos).toEqual([1, 10]);
});

test('extendEdges', () => {
  const f = getFloatUtil();
  let edges: FloatingUtil.Edges;
  // @ts-expect-error
  edges = f.extendEdges(undefined);
  expect(edges).toEqual([0, 0, 0, 0]);
  // @ts-expect-error
  edges = f.extendEdges([]);
  expect(edges).toEqual([1, 1, 1, 1]);
  // @ts-expect-error
  edges = f.extendEdges([2]);
  expect(edges).toEqual([2, 2, 2, 2]);
  // @ts-expect-error
  edges = f.extendEdges([2, 1]);
  expect(edges).toEqual([2, 1, 2, 1]);
  // @ts-expect-error
  edges = f.extendEdges([3, 2, 1]);
  expect(edges).toEqual([3, 2, 1, 2]);
});

test('changeBoxByEdge', () => {
  const f = getFloatUtil();
  let box: FloatingUtil.Box;
  // @ts-expect-error
  box = f.changeBoxByEdges([1, 2, 3, 4], [1, 1, 1, 1]);
  expect(box).toEqual([0, 1, 5, 6]);
  // @ts-expect-error
  box = f.changeBoxByEdgesList(
    [1, 2, 3, 4],
    [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ],
  );
  expect(box).toEqual([-1, 0, 7, 8]);
  // @ts-expect-error
  box = f.changeBoxByEdges([1, 2, 3, 4], [1, 3, 3, 2]);
  expect(box).toEqual([0, 0, 8, 8]);
});

// TODO test getBoxSizes
