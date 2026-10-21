import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as enums from '../../shared/src/constants/enums';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = path.join(projectRoot, 'server/prisma/schema.prisma');
const prismaCli = path.join(projectRoot, 'node_modules/prisma/build/index.js');
const tmpDir = path.join(projectRoot, 'server/prisma/.tmp');
const dbName = `schema-test-${process.pid}-${Date.now()}.db`;
const dbPath = path.join(tmpDir, dbName);

const schema = readFileSync(schemaPath, 'utf8');

const expectedModels = [
  'AiDraft',
  'AiJob',
  'AuditLog',
  'Citation',
  'ConsistencyIssue',
  'Event',
  'Family',
  'GedcomImport',
  'GedcomXref',
  'Narrative',
  'Person',
  'Relation',
  'ReviewRequest',
  'Source',
  'User',
];

function getModelBlock(modelName: string): string {
  const match = schema.match(new RegExp(`^model\\s+${modelName}\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
  if (!match) {
    throw new Error(`Model ${modelName} not found in schema`);
  }
  return match[1];
}

function getStringDefault(modelName: string, fieldName: string): string | undefined {
  const block = getModelBlock(modelName);
  const match = block.match(new RegExp(`${fieldName}\\s+String\\s+@default\\("([^"]+)"\\)`));
  return match?.[1];
}

function migrateDeploy(): void {
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: `file:./.tmp/${dbName}` },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('Prisma schema definition', () => {
  it('defines exactly the 15 models required by the spec', () => {
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
    expect(models.sort()).toEqual(expectedModels);
  });

  it('does not use native enums, Json fields, or scalar lists', () => {
    expect(schema).not.toMatch(/^enum\s+\w+/m);
    expect(schema).not.toMatch(/\bJson\b/);
    expect(schema).not.toMatch(/\b(String|Int|Float|Boolean|DateTime|Json|BigInt|Decimal)\[\]/);
  });

  it('gives every model a cuid primary key and an id index target', () => {
    for (const modelName of expectedModels) {
      expect(getModelBlock(modelName)).toMatch(/\bid\s+String\s+@id\s+@default\(cuid\(\)\)/);
    }
  });

  it('contains the required identity, privacy, version, and audit fields', () => {
    expect(getModelBlock('User')).toMatch(/username\s+String\s+@unique/);
    expect(getModelBlock('User')).toMatch(/passwordHash\s+String/);
    expect(getModelBlock('User')).toMatch(/isActive\s+Boolean\s+@default\(true\)/);

    const person = getModelBlock('Person');
    expect(person).toMatch(/livingStatus\s+String\s+@default\("LIVING"\)/);
    expect(person).toMatch(/status\s+String\s+@default\("ACTIVE"\)/);
    expect(person).toMatch(/mergedIntoId\s+String\?/);
    expect(person).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(person).toMatch(/deletedAt\s+DateTime\?/);
    expect(person).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(person).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);

    expect(getModelBlock('Relation')).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(getModelBlock('Narrative')).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(getModelBlock('AuditLog')).not.toMatch(/updatedAt/);
    expect(getModelBlock('AuditLog')).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(getModelBlock('GedcomXref')).not.toMatch(/updatedAt/);
  });

  it('stores JSON payloads as TEXT-compatible String columns', () => {
    expect(getModelBlock('AiJob')).toMatch(/maskedInput\s+String\?/);
    expect(getModelBlock('AiJob')).toMatch(/maskMap\s+String\?/);
    expect(getModelBlock('AiJob')).toMatch(/outputJson\s+String\?/);
    expect(getModelBlock('AiJob')).toMatch(/statsJson\s+String\?/);
    expect(getModelBlock('AiDraft')).toMatch(/payloadJson\s+String/);
    expect(getModelBlock('Narrative')).toMatch(/contentJson\s+String/);
    expect(getModelBlock('ReviewRequest')).toMatch(/expectedVersionsJson\s+String/);
  });

  it('declares the required uniqueness and lookup indexes', () => {
    expect(schema).toContain('@@unique([type, personAId, personBId])');
    expect(schema).toContain('@@unique([jobId, draftType, tempId])');
    expect(schema).toContain('dedupeKey     String   @unique');
    expect(schema).toContain('@@unique([importId, xref])');
    expect(schema).toContain('@@index([familyId, status])');
    expect(schema).toContain('@@index([targetType, targetId])');
    expect(schema).toContain('@@index([entityType, entityId])');
  });
});

describe('enum constants', () => {
  it('are non-empty unique string sets', () => {
    const groups = Object.entries(enums).filter(([, value]) => Array.isArray(value));
    expect(groups.length).toBeGreaterThanOrEqual(26);

    for (const [name, values] of groups) {
      expect(name).toMatch(/^[A-Z_]+$/);
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('contains every schema default and required lifecycle value', () => {
    expect(enums.LIVING_STATUSES).toContain(getStringDefault('Person', 'livingStatus'));
    expect(enums.PERSON_STATUSES).toContain(getStringDefault('Person', 'status'));
    expect(enums.GENDERS).toContain(getStringDefault('Person', 'gender'));
    expect(enums.ROLES).toContain(getStringDefault('User', 'role'));
    expect(enums.PRECISIONS).toContain(getStringDefault('Person', 'birthPrecision'));
    expect(enums.CALENDARS).toContain(getStringDefault('Person', 'birthCalendar'));
    expect(enums.CERTAINTIES).toContain(getStringDefault('Event', 'certainty'));
    expect(enums.GEDCOM_IMPORT_STATUSES).toContain(getStringDefault('GedcomImport', 'status'));
    expect(enums.AI_PROVIDERS).toEqual(['openai-compatible', 'mock']);
    expect(enums.GEDCOM_IMPORT_STATUSES).toContain('CANCELLED');
    expect(enums.NARRATIVE_STATUSES).toEqual(['DRAFT', 'CONFIRMED']);
  });
});

describe('initial migration', () => {
  let db: DatabaseSync | null = null;

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }

    migrateDeploy();
    migrateDeploy();

    expect(existsSync(dbPath)).toBe(true);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON');
  });

  afterAll(() => {
    db?.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }
  });

  it('creates all 15 tables and applies every migration exactly once', () => {
    if (!db) {
      throw new Error('Database is not open');
    }

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => String((row as { name: string }).name));

    expect(tables).toEqual([...expectedModels, '_prisma_migrations'].sort());

    const applied = db
      .prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')
      .get() as { count: number };
    const migrationCount = readdirSync(path.join(projectRoot, 'server/prisma/migrations'), {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory()).length;

    expect(migrationCount).toBeGreaterThanOrEqual(2);
    expect(Number(applied.count)).toBe(migrationCount);
  });

  it('applies privacy, status, and version defaults', () => {
    if (!db) {
      throw new Error('Database is not open');
    }

    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO "Family" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)',
    ).run('fam-1', 'Test Family', now, now);
    db.prepare(
      'INSERT INTO "Person" ("id", "familyId", "surname", "givenName", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    ).run('person-1', 'fam-1', '张', '德明', now, now);

    const person = db
      .prepare('SELECT * FROM "Person" WHERE "id" = ?')
      .get('person-1') as Record<string, unknown>;

    expect(person.livingStatus).toBe('LIVING');
    expect(person.status).toBe('ACTIVE');
    expect(person.gender).toBe('UNKNOWN');
    expect(person.birthPrecision).toBe('UNKNOWN');
    expect(person.birthCalendar).toBe('UNKNOWN');
    expect(Number(person.birthApproximate)).toBe(0);
    expect(Number(person.version)).toBe(1);
    expect(person.deletedAt).toBeNull();
    expect(String(person.createdAt).length).toBeGreaterThan(0);
  });

  it('enforces unique username, relation tuple, and issue dedupe key', () => {
    if (!db) {
      throw new Error('Database is not open');
    }

    const now = new Date().toISOString();
    const insertUser = db.prepare(
      'INSERT INTO "User" ("id", "username", "passwordHash", "displayName", "updatedAt") VALUES (?, ?, ?, ?, ?)',
    );
    insertUser.run('user-1', 'admin', 'hash', 'Admin', now);
    expect(() => insertUser.run('user-2', 'admin', 'hash', 'Admin 2', now)).toThrow(/UNIQUE/);

    db.prepare(
      'INSERT INTO "Person" ("id", "familyId", "surname", "givenName", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    ).run('person-2', 'fam-1', '张', '文山', now, now);

    const insertRelation = db.prepare(
      'INSERT INTO "Relation" ("id", "type", "personAId", "personBId", "updatedAt") VALUES (?, ?, ?, ?, ?)',
    );
    insertRelation.run('relation-1', 'PARENT_CHILD', 'person-1', 'person-2', now);
    expect(() =>
      insertRelation.run('relation-2', 'PARENT_CHILD', 'person-1', 'person-2', now),
    ).toThrow(/UNIQUE/);

    const insertIssue = db.prepare(
      'INSERT INTO "ConsistencyIssue" ("id", "code", "severity", "entityType", "entityId", "message", "dedupeKey", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertIssue.run('issue-1', 'TEST_CODE', 'ERROR', 'PERSON', 'person-1', 'message', 'dedupe-1', now);
    expect(() =>
      insertIssue.run('issue-2', 'TEST_CODE', 'ERROR', 'PERSON', 'person-1', 'message', 'dedupe-1', now),
    ).toThrow(/UNIQUE/);
  });

  it('rejects rows that violate foreign keys when enforcement is enabled', () => {
    if (!db) {
      throw new Error('Database is not open');
    }

    const now = new Date().toISOString();
    const insertPerson = db.prepare(
      'INSERT INTO "Person" ("id", "familyId", "surname", "givenName", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    );
    expect(() => insertPerson.run('person-x', 'missing-family', '李', '某', now, now)).toThrow(
      /FOREIGN KEY/,
    );
  });
});
