const globalModuleIdSym = Symbol('helper_module_max_id');

/**
 * Unique module id by key
 */
export function getModuleId(key: string): number {
  if (!(globalModuleIdSym in global)) {
    global[globalModuleIdSym] = {};
  }
  const moduleIds: Record<string, number> = global[globalModuleIdSym];
  if (!(key in moduleIds)) {
    moduleIds[key] = 0;
  }
  moduleIds[key] += 1;
  return moduleIds[key];
}
