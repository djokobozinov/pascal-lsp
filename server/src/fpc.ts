import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export interface CompileResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Find the Free Pascal compiler in PATH or common install locations.
 */
export function findFpcPath(): string | null {
  const command = process.platform === 'win32' ? 'fpc.exe' : 'fpc';

  // Check PATH via which/where
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whichCmd} ${command}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = result.trim().split('\n');
    if (lines[0]) {
      return lines[0].trim();
    }
  } catch {
    // Not in PATH
  }

  // Common install locations on Windows
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\FPC\\3.2.2\\bin\\i386-win32\\fpc.exe',
      'C:\\FPC\\2.6.4\\bin\\i386-win32\\fpc.exe',
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'FPC', 'bin', 'fpc.exe'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'FPC', 'bin', 'fpc.exe'),
    ];
    for (const p of commonPaths) {
      if (p && fs.existsSync(p)) {
        return p;
      }
    }
  }

  return null;
}

/**
 * Compile a Pascal file using the Free Pascal compiler.
 * @param filePath Absolute path to the .pas or .pp file
 * @returns Compile result with stdout, stderr, and exit code
 */
export async function compile(filePath: string): Promise<CompileResult> {
  const fpcPath = findFpcPath();
  if (!fpcPath) {
    return {
      stdout: '',
      stderr: 'Free Pascal compiler not found. Install FPC and ensure it is in PATH.',
      code: 1,
    };
  }

  const args = ['-Mdelphi', '-v0', filePath];

  try {
    const { stdout, stderr } = await execFileAsync(fpcPath, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000, // 60 seconds
    });
    return {
      stdout: stdout || '',
      stderr: stderr || '',
      code: 0,
    };
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || (err instanceof Error ? err.message : String(err)),
      code: execError.code ?? 1,
    };
  }
}
