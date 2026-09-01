import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Resolve relative to the project root (front/), where Vitest is invoked.
const SRC = resolve(process.cwd(), 'src/app');

function collectTsFiles(dir: string): string[] {
  // Walk source folders recursively so new files inherit these rules automatically.
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      results.push(full);
    }
  }
  return results;
}

function importsFrom(file: string): string[] {
  // Static imports are enough to reveal forbidden compile-time dependencies.
  const content = readFileSync(file, 'utf8');
  const matches = content.match(/from\s+'([^']+)'/g) ?? [];
  return matches.map((m) => m.replace(/from\s+'/, '').replace(/'$/, ''));
}

function filesUnder(subfolder: string): string[] {
  // Missing optional folders behave like empty boundaries during gradual refactors.
  const dir = join(SRC, subfolder);
  try {
    return collectTsFiles(dir);
  } catch {
    return [];
  }
}

describe('architecture boundaries', () => {
  it('shared/ has no imports from features/, core/, or services/', () => {
    const violations: string[] = [];

    for (const file of filesUnder('shared')) {
      for (const imp of importsFrom(file)) {
        if (imp.includes('/features/') || imp.includes('/core/') || imp.includes('/services/')) {
          violations.push(`${relative(SRC, file)}: imports "${imp}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('core/layout/, core/player/, and core/auth/ have no imports from features/', () => {
    const violations: string[] = [];
    const restricted = ['core/layout', 'core/player', 'core/auth'];

    for (const subfolder of restricted) {
      for (const file of filesUnder(subfolder)) {
        for (const imp of importsFrom(file)) {
          if (imp.includes('/features/')) {
            violations.push(`${relative(SRC, file)}: imports "${imp}"`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("features/ UI layers do not import another feature's UI layer", () => {
    const violations: string[] = [];

    for (const file of filesUnder('features')) {
      const rel = relative(SRC, file);
      // The first path segment identifies which feature owns this file.
      const parts = rel.replace('features/', '').split('/');
      const thisFeature = parts[0];

      for (const imp of importsFrom(file)) {
        // Features may share data contracts, but not reach into another feature's UI.
        const crossMatch = imp.match(/features\/([^/]+)\/ui\//);
        if (crossMatch && crossMatch[1] !== thisFeature) {
          violations.push(`${rel}: imports UI from "${crossMatch[1]}" feature`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('landing/ and errors/ have no imports from features/', () => {
    const violations: string[] = [];

    for (const subfolder of ['landing', 'errors']) {
      for (const file of filesUnder(subfolder)) {
        for (const imp of importsFrom(file)) {
          // Block parent traversal into app features while allowing local subfolders.
          if (/\.\.\/.*features\//.test(imp)) {
            violations.push(`${relative(SRC, file)}: imports "${imp}"`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
