// @ts-ignore
import Pkg from '../_package.json';

export const version: string = Pkg.version;

export const versionName = version.replace(/[.-]/g, '_');
