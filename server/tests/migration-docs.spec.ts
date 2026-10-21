import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const MIGRATIONS_DIR = path.join(
  PROJECT_ROOT,
  'server',
  'prisma',
  'migrations',
);
const DOCS_PATH = path.join(PROJECT_ROOT, 'docs', 'migrations.md');
const PACKAGE_PATH = path.join(PROJECT_ROOT, 'package.json');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');

interface PackageJson {
  scripts?: Record<string, string>;
}

function readMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

const document = readFileSync(DOCS_PATH, 'utf8');
const packageText = readFileSync(PACKAGE_PATH, 'utf8');
const packageJson = JSON.parse(packageText) as PackageJson;
const scripts = packageJson.scripts ?? {};

describe('migration documentation', () => {
  it('lists every local migration in the ownership table exactly once', () => {
    const tableMigrations = [
      ...document.matchAll(/^\|\s*`(\d{14}_[a-z0-9_]+)`\s*\|/gm),
    ]
      .map((match) => match[1])
      .sort();

    expect(tableMigrations).toEqual(readMigrationNames());
  });

  it('only references npm scripts that exist', () => {
    const referenced = [
      ...new Set(
        [...document.matchAll(/npm run ([\w:]+)/g)].map((match) => match[1]),
      ),
    ];

    expect(referenced.length).toBeGreaterThan(0);

    for (const scriptName of referenced) {
      expect(scripts, `Missing npm script "${scriptName}"`).toHaveProperty(
        scriptName,
      );
    }
  });

  it('documents the mandatory pre-migration backup and restore-based rollback', () => {
    expect(document).toContain('强制迁移前备份');
    expect(document).toContain('npm run backup');
    expect(document).toContain('备份失败');
    expect(document).toContain('forward-only');
    expect(document).toContain('恢复式回滚');
    expect(document).toContain('迁移前备份');
    expect(document).toContain('db:verify');
    expect(document).toContain('db:status');
    expect(document).toContain('migrate deploy');
  });

  it('documents the drill, failure handling, and prohibited operations', () => {
    expect(document).toContain('测试库重建与回滚演练');
    expect(document).toContain('迁移清单与所有权');
    expect(document).toContain('失败迁移处理');
    expect(document).toContain('禁止操作');
    expect(document).toContain('MIGRATIONS_PENDING');
    expect(document).toContain('MIGRATIONS_ORDER_MISMATCH');
  });

  it('keeps destructive commands out of package scripts and automation', () => {
    const sources = [
      { name: 'package.json', content: packageText },
      ...listFiles(SCRIPTS_DIR)
        .filter((filePath) => filePath.endsWith('.ts'))
        .map((filePath) => ({
          name: path.relative(PROJECT_ROOT, filePath),
          content: readFileSync(filePath, 'utf8'),
        })),
    ];

    const forbidden = [
      /migrate\s+reset/i,
      /db\s+push\s+--force-reset/i,
      /--accept-data-loss/i,
    ];

    for (const source of sources) {
      for (const pattern of forbidden) {
        expect(source.content, `${source.name} contains ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });
});
