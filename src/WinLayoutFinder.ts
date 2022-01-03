import { workspace } from 'coc.nvim';

export namespace WinLayoutFinder {
  export type VimGroup = [type: 'col' | 'row', nodes: VimNode[]];
  export type VimLeaf = [type: 'leaf', winid: number];
  export type VimNode = VimGroup | VimLeaf;

  export interface Base {
    parent?: {
      group: Group;
      indexInParent: number;
    };
  }
  export interface Group extends Base {
    type: 'col' | 'row';
    children: Node[];
  }
  export interface Leaf extends Base {
    type: 'leaf';
    winid: number;
  }
  export type Node = Group | Leaf;
}

export class WinLayoutFinder {
  private static convertVimLayoutNode(
    vimLayout: WinLayoutFinder.VimNode,
    parent?: WinLayoutFinder.Base['parent'],
  ): WinLayoutFinder.Node {
    if (vimLayout[0] === 'leaf') {
      return {
        type: vimLayout[0],
        winid: vimLayout[1],
        parent,
      };
    } else {
      const group: WinLayoutFinder.Group = {
        type: vimLayout[0],
        children: [],
      };
      group.children = vimLayout[1].map((child, idx) =>
        this.convertVimLayoutNode(child, {
          group,
          indexInParent: idx,
        }),
      );
      return group;
    }
  }

  static async create() {
    const root: WinLayoutFinder.VimNode = await workspace.nvim.call(
      'winlayout',
      [],
    );
    return new this(this.convertVimLayoutNode(root));
  }

  static getFirstLeafWinid(node: WinLayoutFinder.Node): number {
    if (node.type === 'leaf') {
      return node.winid;
    } else {
      return this.getFirstLeafWinid(node.children[0]);
    }
  }

  constructor(public readonly root: WinLayoutFinder.Node) {}

  /**
   * @return [node, parent, indexInParent]
   */
  findWinid(
    winid: number,
    beginNode: WinLayoutFinder.Node = this.root,
  ): undefined | WinLayoutFinder.Leaf {
    if (beginNode.type === 'leaf') {
      if (beginNode.winid === winid) {
        return beginNode;
      }
    } else {
      for (const child of beginNode.children) {
        const target = this.findWinid(winid, child);
        if (target) {
          return target;
        }
      }
    }
  }

  findClosest(
    beginNode: WinLayoutFinder.Node,
    matchWinids: number[],
  ): WinLayoutFinder.Leaf | undefined {
    const checked = new Set([beginNode]);
    const queue = [beginNode];
    while (queue.length) {
      const node = queue.shift()!;

      if (node.type === 'leaf') {
        if (matchWinids.includes(node.winid)) {
          return node;
        }
      } else {
        for (const child of node.children) {
          if (!checked.has(child)) {
            queue.push(child);
            checked.add(child);
            continue;
          }
        }
      }

      if (node.parent && !checked.has(node.parent.group)) {
        queue.push(node.parent.group);
        checked.add(node.parent.group);
      }
    }
  }
}
