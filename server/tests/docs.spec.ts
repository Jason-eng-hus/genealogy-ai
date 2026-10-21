import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as enums from '../../shared/src/constants/enums';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaText = readFileSync(path.join(repoRoot, 'server/prisma/schema.prisma'), 'utf8');
const erDoc = readFileSync(path.join(repoRoot, 'docs/er.md'), 'utf8');
const dictionary = readFileSync(path.join(repoRoot, 'docs/data-dictionary.md'), 'utf8');

type ScalarField = {
  name: string;
  type: string;
  optional: boolean;
  line: string;
};

type RelationField = {
  name: string;
  target: string;
  optional: boolean;
  onDelete: string;
  line: string;
};

type SchemaModel = {
  name: string;
  body: string;
  scalars: ScalarField[];
  relations: RelationField[];
};

const modelMatches = [...schemaText.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)];
const modelNames = modelMatches.map((match) => match[1]);

function parseSchema(): SchemaModel[] {
  return modelMatches.map((match) => {
    const name = match[1];
    const body = match[2];
    const scalars: ScalarField[] = [];
    const relations: RelationField[] = [];

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) {
        continue;
      }
      const fieldMatch = line.match(/^(\w+)\s+([A-Za-z_]\w*)(\?|\[\])?/);
      if (!fieldMatch) {
        continue;
      }
      const fieldName = fieldMatch[1];
      const baseType = fieldMatch[2];
      const suffix = fieldMatch[3] ?? '';
      const isRelation = suffix === '[]' || modelNames.includes(baseType);
      if (isRelation) {
        const optional = suffix === '?';
        const explicitOnDelete = line.match(/onDelete:\s*(\w+)/)?.[1];
        relations.push({
          name: fieldName,
          target: baseType,
          optional,
          onDelete: explicitOnDelete ?? (optional ? 'SetNull' : 'Restrict'),
          line,
        });
        continue;
      }
      scalars.push({
        name: fieldName,
        type: baseType + (suffix === '?' ? '?' : ''),
        optional: suffix === '?',
        line,
      });
    }

    return { name, body, scalars, relations };
  });
}

const schemaModels = parseSchema();
const modelByName = new Map(schemaModels.map((model) => [model.name, model]));

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRows(block: string): string[][] {
  return block
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length > 0 && !isSeparatorRow(cells));
}

function between(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`missing marker: ${startMarker}`);
  }
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(`missing end marker: ${endMarker}`);
  }
  return text.slice(start + startMarker.length, end);
}

function parseDictionary(): {
  fields: Map<string, Map<string, { type: string; required: string; sensitivity: string }>>;
  sections: Map<string, string>;
} {
  const sectionStart = dictionary.indexOf('## 5 模型字段字典');
  const sectionEnd = dictionary.indexOf('## 6 状态机');
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error('data dictionary is missing section 5 or 6');
  }
  const section = dictionary.slice(sectionStart, sectionEnd);
  const headings = [...section.matchAll(/^### 5\.\d+\s+([A-Z][A-Za-z]*)/gm)];
  const result = new Map<string, Map<string, { type: string; required: string; sensitivity: string }>>();
  const sections = new Map<string, string>();

  headings.forEach((heading, index) => {
    const modelName = heading[1];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : section.length;
    const block = section.slice(start, end);
    sections.set(modelName, block);
    const fields = new Map<string, { type: string; required: string; sensitivity: string }>();

    for (const cells of parseTableRows(block)) {
      if (cells.length !== 6) {
        continue;
      }
      const fieldName = cells[0].match(/^`([^`]+)`$/)?.[1];
      const typeName = cells[1].match(/^`([^`]+)`$/)?.[1];
      if (!fieldName || !typeName) {
        continue;
      }
      if (fields.has(fieldName)) {
        throw new Error(`duplicate dictionary row ${modelName}.${fieldName}`);
      }
      fields.set(fieldName, {
        type: typeName,
        required: cells[2],
        sensitivity: cells[4],
      });
    }
    result.set(modelName, fields);
  });

  return { fields: result, sections };
}

const parsedDictionary = parseDictionary();
const dictionaryFields = parsedDictionary.fields;
const dictionarySections = parsedDictionary.sections;

function parseFkInventory(): Set<string> {
  const block = between(erDoc, '### 3.1 物理外键', '### 3.2 逻辑/多态引用');
  const result = new Set<string>();
  for (const cells of parseTableRows(block)) {
    if (cells.length < 7 || !modelNames.includes(cells[0])) {
      continue;
    }
    result.add(
      `${cells[0]}.${cells[1].replace(/`/g, '')}|${cells[2].replace(/`/g, '')}|${cells[5]}|${cells[4]}`,
    );
  }
  return result;
}

function parseIndexInventory(): Set<string> {
  const block = between(erDoc, '## 5 索引与唯一约束清单', '## 6 设计评审记录');
  const result = new Set<string>();
  for (const cells of parseTableRows(block)) {
    if (cells.length < 3 || !modelNames.includes(cells[0])) {
      continue;
    }
    const definition = cells[1].replace(/`/g, '').replace(/\s+/g, '');
    if (definition.startsWith('@')) {
      result.add(`${cells[0]}.${definition}`);
    }
  }
  return result;
}

function schemaIndexDefinitions(): Set<string> {
  const result = new Set<string>();
  for (const model of schemaModels) {
    for (const rawLine of model.body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const fieldUnique = line.match(/^(\w+)\s+[^@]+@unique\b/);
      if (fieldUnique) {
        result.add(`${model.name}.@unique(${fieldUnique[1]})`);
      }
      for (const match of line.matchAll(/@@(unique|index)\(\[([^\]]+)\]\)/g)) {
        const fields = match[2]
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean)
          .join(',');
        result.add(`${model.name}.@@${match[1]}([${fields}])`);
      }
    }
  }
  return result;
}

function schemaFkDefinitions(): Set<string> {
  const result = new Set<string>();
  for (const model of schemaModels) {
    for (const relation of model.relations) {
      if (!relation.line.includes('@relation(') || !relation.line.includes('fields:')) {
        continue;
      }
      result.add(
        `${model.name}.${relation.name}|${relation.target}|${relation.onDelete}|${relation.optional ? '是' : '否'}`,
      );
    }
  }
  return result;
}

function erDiagramBlock(): string {
  const match = erDoc.match(/```mermaid\n([\s\S]*?)```/);
  if (!match) {
    throw new Error('er.md is missing a mermaid block');
  }
  return match[1];
}

function schemaFkPairs(): Map<string, number> {
  const pairs = new Map<string, number>();
  for (const model of schemaModels) {
    for (const relation of model.relations) {
      if (!relation.line.includes('@relation(') || !relation.line.includes('fields:')) {
        continue;
      }
      const key = `${model.name}->${relation.target}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  return pairs;
}

function mermaidRelationshipPairs(): Map<string, number> {
  const pairs = new Map<string, number>();
  for (const line of erDiagramBlock().split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z]\w*)\s+[|o{}-]+--[|o{}-]+\s*([A-Za-z]\w*)\s*:/);
    if (!match) {
      continue;
    }
    const key = `${match[2]}->${match[1]}`; // Mermaid points parent -> child; FKs live on the child side.
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  return pairs;
}

function stateMachineSections(): Map<string, string> {
  const matches = [...dictionary.matchAll(/^### 6\.\d+\s+`([^`]+)`/gm)];
  const result = new Map<string, string>();
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index
        : dictionary.indexOf('## 7 数据库无法表达');
    const block = dictionary.slice(start, end);
    if (result.has(match[1])) {
      throw new Error(`duplicate state machine section ${match[1]}`);
    }
    result.set(match[1], block);
  });
  return result;
}

function enumDictionaryRows(): Map<string, string[]> {
  const block = between(dictionary, '## 4 枚举常量字典', '## 5 模型字段字典');
  const result = new Map<string, string[]>();
  for (const cells of parseTableRows(block)) {
    const group = cells[0]?.replace(/`/g, '').trim();
    if (!group || !(group in enums) || !Array.isArray((enums as Record<string, unknown>)[group])) {
      continue;
    }
    const values = [...(cells[1] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    result.set(group, values);
  }
  return result;
}

const enumEntries: Array<[string, readonly string[]]> = Object.entries(enums)
  .filter(([, value]) => Array.isArray(value))
  .map(([name, value]) => [name, value as readonly string[]]);
const allEnumValues = new Set<string>(enumEntries.flatMap(([, values]) => [...values]));

const statusEnumByField: Record<string, readonly string[]> = {
  'Person.status': enums.PERSON_STATUSES,
  'Person.livingStatus': enums.LIVING_STATUSES,
  'Source.transcriptionStatus': enums.TRANSCRIPTION_STATUSES,
  'AiJob.status': enums.AI_JOB_STATUSES,
  'AiDraft.status': enums.DRAFT_STATUSES,
  'Narrative.status': enums.NARRATIVE_STATUSES,
  'ConsistencyIssue.status': enums.ISSUE_STATUSES,
  'ReviewRequest.status': enums.REVIEW_STATUSES,
  'GedcomImport.status': enums.GEDCOM_IMPORT_STATUSES,
};

describe('3.1.3 documentation consistency', () => {
  it('documents exactly the 15 schema models', () => {
    expect(modelNames).toHaveLength(15);
    expect([...dictionaryFields.keys()].sort()).toEqual([...modelNames].sort());
  });

  it('documents every scalar column with the exact type and requiredness', () => {
    for (const model of schemaModels) {
      const documented = dictionaryFields.get(model.name);
      expect(documented, `missing model section for ${model.name}`).toBeDefined();
      expect([...documented!.keys()].sort()).toEqual(model.scalars.map((field) => field.name).sort());

      for (const field of model.scalars) {
        const entry = documented!.get(field.name);
        expect(entry, `missing field ${model.name}.${field.name}`).toBeDefined();
        expect(entry!.type, `type mismatch for ${model.name}.${field.name}`).toBe(field.type);
        expect(entry!.required, `requiredness mismatch for ${model.name}.${field.name}`).toBe(
          field.optional ? '否' : '是',
        );
      }
    }
  });

  it('documents every relation navigation field for each model', () => {
    for (const model of schemaModels) {
      const section = dictionarySections.get(model.name);
      expect(section, `missing model section for ${model.name}`).toBeDefined();
      for (const relation of model.relations) {
        expect(section, `missing relation field ${model.name}.${relation.name}`).toContain(
          `\`${relation.name}\``,
        );
      }
    }
  });

  it('assigns a valid sensitivity level to every documented field', () => {
    for (const [modelName, fields] of dictionaryFields) {
      for (const [fieldName, entry] of fields) {
        expect(
          entry.sensitivity,
          `invalid sensitivity for ${modelName}.${fieldName}: ${entry.sensitivity}`,
        ).toMatch(/^L[0-3](\/L[0-3])?$/);
      }
    }

    const mandatoryL3 = [
      'User.passwordHash',
      'Source.storagePath',
      'AiJob.maskMap',
      'AuditLog.ip',
      'AuditLog.userAgent',
    ];
    for (const field of mandatoryL3) {
      const [modelName, fieldName] = field.split('.');
      expect(dictionaryFields.get(modelName)?.get(fieldName)?.sensitivity, `${field} must be L3`).toBe('L3');
    }
  });

  it('keeps the physical foreign-key inventory in sync with schema relations', () => {
    const documented = parseFkInventory();
    const expected = schemaFkDefinitions();
    expect([...documented].sort()).toEqual([...expected].sort());
  });

  it('keeps the index inventory in sync with schema indexes and unique constraints', () => {
    const documented = parseIndexInventory();
    const expected = schemaIndexDefinitions();
    expect([...documented].sort()).toEqual([...expected].sort());
  });

  it('covers all models in the mermaid ER diagram', () => {
    const diagram = erDiagramBlock();
    for (const model of modelNames) {
      expect(diagram, `ER diagram missing model ${model}`).toMatch(new RegExp(`^\\s*${model}\\s*\\{`, 'm'));
    }
  });

  it('keeps mermaid relationship pairs in sync with schema foreign keys', () => {
    const expected = [...schemaFkPairs().entries()].sort(([a], [b]) => a.localeCompare(b));
    const documented = [...mermaidRelationshipPairs().entries()].sort(([a], [b]) => a.localeCompare(b));
    expect(documented).toEqual(expected);
  });

  it('covers every status field with a state machine section and all enum values', () => {
    const sections = stateMachineSections();
    const statusFields = schemaModels.flatMap((model) =>
      model.scalars
        .filter((field) => field.name === 'status' || field.name.endsWith('Status'))
        .map((field) => `${model.name}.${field.name}`),
    );

    expect([...sections.keys()].sort()).toEqual([...statusFields].sort());
    for (const field of statusFields) {
      expect(statusEnumByField[field], `missing enum mapping for ${field}`).toBeDefined();
      const block = sections.get(field)!;
      for (const value of statusEnumByField[field]) {
        expect(block, `${field} state machine missing value ${value}`).toContain(`\`${value}\``);
      }
    }
  });

  it('lists all enum groups and values exactly as defined in shared constants', () => {
    const rows = enumDictionaryRows();
    expect([...rows.keys()].sort()).toEqual(enumEntries.map(([name]) => name).sort());
    for (const [name, values] of enumEntries) {
      expect(rows.get(name), `enum dictionary missing ${name}`).toEqual([...values]);
    }
  });

  it('only uses known enum values as string defaults in schema', () => {
    for (const model of schemaModels) {
      for (const field of model.scalars) {
        for (const match of field.line.matchAll(/@default\("([A-Z][A-Z0-9_]*)"\)/g)) {
          expect(allEnumValues.has(match[1]), `unknown enum default ${model.name}.${field.name}=${match[1]}`).toBe(
            true,
          );
        }
      }
    }
  });
});
