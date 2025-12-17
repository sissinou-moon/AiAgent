import path from 'path';
import fs from 'fs-extra';
import { SANDBOX_ROOT } from '../config';
import { FileOperation } from '../types';

export class SandboxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SandboxError';
    }
}

/**
 * Resolves a relative path to a safe absolute path within the sandbox.
 * Throws if the path escapes the sandbox.
 */
function resolveSafePath(relativePath: string): string {
    const safePath = path.resolve(SANDBOX_ROOT, relativePath);
    if (!safePath.startsWith(SANDBOX_ROOT)) {
        throw new SandboxError(`Security Violation: Path ${relativePath} traverses outside the sandbox.`);
    }
    return safePath;
}


function normalizeQuotes(str: string): string {
    return str.replace(/['’`“"”]/g, "'");
}

async function findPathWithLooseQuotes(fullPath: string): Promise<string> {
    const safePath = resolveSafePath(fullPath);
    if (await fs.pathExists(safePath)) {
        return safePath;
    }

    // Try fuzzy match on the basename in the parent directory
    const dir = path.dirname(safePath);
    const base = path.basename(safePath);

    if (await fs.pathExists(dir)) {
        const files = await fs.readdir(dir);
        const normalizedBase = normalizeQuotes(base);

        for (const file of files) {
            if (normalizeQuotes(file) === normalizedBase) {
                return path.join(dir, file);
            }
        }
    }

    // Return the original safe path (which doesn't exist) to let the caller handle the error
    return safePath;
}

export async function executeOperation(operation: FileOperation): Promise<any> {
    try {
        switch (operation.op) {
            case 'write': {
                const target = resolveSafePath(operation.path);
                await fs.ensureDir(path.dirname(target));
                await fs.writeFile(target, operation.content, 'utf-8');
                return { status: 'success', path: operation.path, op: 'write' };
            }
            case 'read': {
                const target = await findPathWithLooseQuotes(operation.path);
                if (!await fs.pathExists(target)) throw new SandboxError(`File not found: ${operation.path}`);
                const content = await fs.readFile(target, 'utf-8');
                return { status: 'success', content, path: operation.path, op: 'read' };
            }
            case 'mkdir': {
                const target = resolveSafePath(operation.path);
                await fs.ensureDir(target);
                return { status: 'success', path: operation.path, op: 'mkdir' };
            }
            case 'delete': {
                const target = await findPathWithLooseQuotes(operation.path);
                // EBUSY Retry Logic
                let retries = 3;
                while (retries > 0) {
                    try {
                        await fs.remove(target);
                        break;
                    } catch (err: any) {
                        if (err.code === 'EBUSY' && retries > 1) {
                            retries--;
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } else {
                            throw err;
                        }
                    }
                }
                return { status: 'success', path: operation.path, op: 'delete' };
            }
            case 'move': {
                // Source should use smart lookup
                const src = await findPathWithLooseQuotes(operation.from);
                // Dest should be exact
                const dest = resolveSafePath(operation.to);

                await fs.ensureDir(path.dirname(dest));
                await fs.move(src, dest, { overwrite: true });
                return { status: 'success', from: operation.from, to: operation.to, op: 'move' };
            }
            case 'copy': {
                const src = await findPathWithLooseQuotes(operation.from);
                const dest = resolveSafePath(operation.to);
                await fs.ensureDir(path.dirname(dest));
                await fs.copy(src, dest, { overwrite: true });
                return { status: 'success', from: operation.from, to: operation.to, op: 'copy' };
            }
            case 'list': {
                const target = await findPathWithLooseQuotes(operation.path);
                if (!await fs.pathExists(target)) throw new SandboxError(`Directory not found: ${operation.path}`);

                const allFiles = await fs.readdir(target);
                let files = allFiles;

                if (operation.pattern) {
                    const q = operation.pattern.toLowerCase().replace('*', '');
                    files = allFiles.filter(f => f.toLowerCase().includes(q));
                }

                return { status: 'success', files, path: operation.path, op: 'list' };
            }
            case 'move_all': {
                // move_all usually operates on a directory, smart lookup logic applies to the dir path
                const srcDir = await findPathWithLooseQuotes(operation.path);
                const destDir = resolveSafePath(operation.destination);

                if (!await fs.pathExists(srcDir)) throw new SandboxError(`Source directory not found: ${operation.path}`);
                await fs.ensureDir(destDir);

                const files = await fs.readdir(srcDir);
                const movedFiles = [];
                const errors = [];

                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    if (operation.extensions.includes(ext) || operation.extensions.includes(ext.replace('.', ''))) {
                        const srcFile = path.join(srcDir, file);
                        const destFile = path.join(destDir, file);
                        try {
                            await fs.move(srcFile, destFile, { overwrite: true });
                            movedFiles.push(file);
                        } catch (err: any) {
                            errors.push({ file, error: err.message });
                        }
                    }
                }
                return { status: 'success', moved: movedFiles, errors, op: 'move_all' };
            }
            default:
                throw new SandboxError(`Unknown operation type`);
        }
    } catch (error: any) {
        return { status: 'error', error: error.message, op: operation.op };
    }
}
