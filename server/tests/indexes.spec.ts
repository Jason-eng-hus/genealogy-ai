import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from './support/temp-database.ts';

const REMOVED_INDEXES: Array<[string, string]> = [
  ['AiDraft', 'AiDraft_jobId_idx'],
  ['AuditLog', 'AuditLog_entityType_entityId_idx'],
  ['AuditLog', 'AuditLog_action_idx'],
  ['AuditLog', 'AuditLog_actorId_idx'],
  ['ConsistencyIssue', 'ConsistencyIssue_status_severity_idx'],
  ['Event', 'Event_relationId_idx'],
  ['Event', 'Event_personId_idx'],
  ['Relation', 'Relation_personBId_idx'],
  ['Relation', 'Relation_personAId_idx'],
];

const COMPOSITE_INDEXES: Array<[string, string, string[]]> = [
  ['AiDraft', 'AiDraft_jobId_status_idx', ['jobId', 'status']],
  [
    'AuditLog',
    'AuditLog_actorId_createdAt_idx',
    ['actorId', 'createdAt'],
  ],
  [
    'AuditLog',
    'AuditLog_action_createdAt_idx',
    ['action', 'createdAt'],
  ],
  [
    'AuditLog',
    'AuditLog_entityType_entityId_createdAt_idx',
    ['entityType', 'entityId', 'createdAt'],
  ],
  [
    'ConsistencyIssue',
    'ConsistencyIssue_status_severity_lastSeenAt_idx',
    ['status', 'severity', 'lastSeenAt'],
  ],
  ['Event', 'Event_personId_type_idx', ['personId', 'type']],
  ['Event', 'Event_relationId_type_idx', ['relationId', 'type']],
  ['Relation', 'Relation_personAId_type_idx', ['personAId', 'type']],
  ['Relation', 'Relation_personBId_type_idx', ['personBId', 'type']],
];

const UNIQUE_INDEXES = [
  'AiDraft_jobId_draftType_tempId_key',
  'ConsistencyIssue_dedupeKey_key',
  'GedcomXref_importId_xref_key',
  'Relation_type_personAId_personBId_key',
  'User_username_key',
];

const QUERY_PLANS: Array<{ index: string; sql: string }> = [
  {
    index: 'Relation_personAId_type_idx',
    sql: 'SELECT * FROM "Relation" INDEXED BY "Relation_personAId_type_idx" WHERE "personAId" = \'p\' AND "type" = \'PARENT_CHILD\'',
  },
  {
    index: 'Relation_personBId_type_idx',
    sql: 'SELECT * FROM "Relation" INDEXED BY "Relation_personBId_type_idx" WHERE "personBId" = \'p\' AND "type" = \'PARENT_CHILD\'',
  },
  {
    index: 'Event_personId_type_idx',
    sql: 'SELECT * FROM "Event" INDEXED BY "Event_personId_type_idx" WHERE "personId" = \'p\' AND "type" = \'BIRT\'',
  },
  {
    index: 'Event_relationId_type_idx',
    sql: 'SELECT * FROM "Event" INDEXED BY "Event_relationId_type_idx" WHERE "relationId" = \'r\' AND "type" = \'MARR\'',
  },
  {
    index: 'AiDraft_jobId_status_idx',
    sql: 'SELECT * FROM "AiDraft" INDEXED BY "AiDraft_jobId_status_idx" WHERE "jobId" = \'j\' AND "status" = \'PENDING\'',
  },
  {
    index: 'ConsistencyIssue_status_severity_lastSeenAt_idx',
    sql: 'SELECT * FROM "ConsistencyIssue" INDEXED BY "ConsistencyIssue_status_severity_lastSeenAt_idx" WHERE "status" = \'OPEN\' AND "severity" = \'ERROR\' ORDER BY "lastSeenAt"',
  },
  {
    index: 'AuditLog_actorId_createdAt_idx',
    sql: 'SELECT * FROM "AuditLog" INDEXED BY "AuditLog_actorId_createdAt_idx" WHERE "actorId" = \'u\' ORDER BY "createdAt"',
  },
  {
    index: 'AuditLog_action_createdAt_idx',
    sql: 'SELECT * FROM "AuditLog" INDEXED BY "AuditLog_action_createdAt_idx" WHERE "action" = \'PERSON_UPDATE\' ORDER BY "createdAt"',
  },
  {
    index: 'AuditLog_entityType_entityId_createdAt_idx',
    sql: 'SELECT * FROM "AuditLog" INDEXED BY "AuditLog_entityType_entityId_createdAt_idx" WHERE "entityType" = \'PERSON\' AND "entityId" = \'p\' ORDER BY "createdAt"',
  },
];

let temp: TempDatabase;
let database: DatabaseSync;

function indexExists(indexName: string): boolean {
  return (
    database
      .prepare(
        "SELECT 1 AS found FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get(indexName) !== undefined
  );
}

function indexColumns(indexName: string): string[] {
  return (
    database.prepare(`PRAGMA index_info("${indexName}")`).all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);
}

function queryPlan(sql: string): string {
  return (
    database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{
      detail: string;
    }>
  )
    .map((row) => row.detail)
    .join(' | ');
}

beforeAll(() => {
  temp = createTempDatabase('indexes');
  database = new DatabaseSync(temp.filePath);
  database.exec('PRAGMA foreign_keys = ON');
});

afterAll(() => {
  database?.close();
  temp?.cleanup();
});

describe('query index migration', () => {
  it('removes the nine redundant single-column indexes', () => {
    for (const [table, indexName] of REMOVED_INDEXES) {
      expect(indexExists(indexName), `${table}.${indexName} should be removed`).toBe(false);
    }
  });

  it('creates the nine composite replacements with the expected column order', () => {
    for (const [table, indexName, columns] of COMPOSITE_INDEXES) {
      expect(indexExists(indexName), `${table}.${indexName} should exist`).toBe(true);
      expect(indexColumns(indexName), `${table}.${indexName}`).toEqual(columns);
    }
  });

  it('keeps the query planner on the intended composite index', () => {
    for (const { index, sql } of QUERY_PLANS) {
      const plan = queryPlan(sql);
      expect(plan, `${index} plan: ${plan}`).toContain(index);
    }
  });

  it('preserves the unique constraints from the initial migration', () => {
    for (const indexName of UNIQUE_INDEXES) {
      const row = database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
        )
        .get(indexName) as { sql: string | null } | undefined;

      expect(row, indexName).toBeDefined();
      expect(row?.sql ?? '', indexName).toMatch(/^CREATE UNIQUE INDEX/);
    }
  });
});
