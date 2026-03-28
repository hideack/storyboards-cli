import * as path from 'path';
import * as os from 'os';

export function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function resolveAbsolute(filePath: string): string {
  return path.resolve(expandHome(filePath));
}
