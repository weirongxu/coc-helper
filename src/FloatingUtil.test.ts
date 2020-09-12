import { jestHelper } from './JestHelper';
import { FloatingUtil } from './FloatingUtil';

jestHelper.boot({ internal: true });

function getFloatUtil(): FloatingUtil {
  return new FloatingUtil(0);
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
  const pos = f.getCenterPos(ctx, [3, 3, 9, 9]);
  expect(pos).toEqual([20, 20]);
});

test('getPosForAround', () => {
  const f = getFloatUtil();
  const ctx = getCtx();
  let pos: FloatingUtil.Position;
  pos = f.getPosForAround(ctx, [9, 9], [0, 0]);
  expect(pos).toEqual([1, 0]);
  pos = f.getPosForAround(ctx, [9, 9], [41, 0]);
  expect(pos).toEqual([32, 0]);
  pos = f.getPosForAround(ctx, [9, 9], [0, 41]);
  expect(pos).toEqual([1, 33]);
  pos = f.getPosForAround(ctx, [9, 9], [41, 41]);
  expect(pos).toEqual([32, 33]);
  pos = f.getPosForAround(ctx, [9, 9], [0, 0], true);
  expect(pos).toEqual([1, 0]);
  pos = f.getPosForAround(ctx, [9, 9], [10, 10], true);
  expect(pos).toEqual([1, 10]);
});

test('extendEdges', () => {
  const f = getFloatUtil();
  let edges: FloatingUtil.Edges;
  edges = f.extendEdges(undefined);
  expect(edges).toEqual([0, 0, 0, 0]);
  edges = f.extendEdges([]);
  expect(edges).toEqual([1, 1, 1, 1]);
  edges = f.extendEdges([2]);
  expect(edges).toEqual([2, 2, 2, 2]);
  edges = f.extendEdges([2, 1]);
  expect(edges).toEqual([2, 1, 2, 1]);
  edges = f.extendEdges([3, 2, 1]);
  expect(edges).toEqual([3, 2, 1, 2]);
});

test('changeBoxByEdge', () => {
  const f = getFloatUtil();
  let box: FloatingUtil.Box;
  box = f.changeBoxByEdges([1, 2, 3, 4], [1, 1, 1, 1]);
  expect(box).toEqual([0, 1, 5, 6]);
  box = f.changeBoxByEdgesList(
    [1, 2, 3, 4],
    [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ],
  );
  expect(box).toEqual([-1, 0, 7, 8]);
  box = f.changeBoxByEdges([1, 2, 3, 4], [1, 3, 3, 2]);
  expect(box).toEqual([0, 0, 8, 8]);
});

test('getBoxSizes', () => {
  const f = getFloatUtil();
  let box: {
    contentBox: FloatingUtil.Box;
    paddingBox: FloatingUtil.Box;
    borderBox: FloatingUtil.Box;
  };
  const ctx = getCtx();

  ctx.border = [0, 0, 0, 0];
  ctx.padding = [0, 0, 0, 0];
  box = f.getBoxSizes(
    ctx,
    {
      top: 0,
      left: 0,
      width: 100,
      height: 100,
    },
    true,
  );
  expect(box.borderBox).toEqual([0, 0, 100, 100]);
  expect(box.contentBox).toEqual([0, 0, 100, 100]);

  ctx.border = [1, 1, 1, 1];
  ctx.padding = [0, 0, 0, 0];
  box = f.getBoxSizes(
    ctx,
    {
      top: 0,
      left: 0,
      width: 100,
      height: 100,
    },
    true,
  );
  expect(box.borderBox).toEqual([0, 0, 102, 102]);
  expect(box.contentBox).toEqual([1, 1, 100, 100]);

  ctx.border = [1, 1, 1, 1];
  ctx.padding = [1, 1, 1, 1];
  box = f.getBoxSizes(
    ctx,
    {
      top: 0,
      left: 0,
      width: 100,
      height: 100,
    },
    true,
  );
  expect(box.borderBox).toEqual([0, 0, 104, 104]);
  expect(box.paddingBox).toEqual([1, 1, 102, 102]);
  expect(box.contentBox).toEqual([2, 2, 100, 100]);
});
