const globalModuleIdKey = '__coc_helper_module_max_id';
export function getModuleId(key: string): number {
  const globalKey = `${globalModuleIdKey}_${key}`;
  if (!(globalKey in global)) {
    global[globalKey] = 0;
  }
  global[globalKey] += 1;
  return global[globalKey];
}
