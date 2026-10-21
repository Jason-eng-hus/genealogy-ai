export const ROLES = ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'] as const;
export type Gender = (typeof GENDERS)[number];

export const LIVING_STATUSES = ['LIVING', 'DECEASED', 'UNKNOWN'] as const;
export type LivingStatus = (typeof LIVING_STATUSES)[number];

export const PERSON_STATUSES = ['ACTIVE', 'MERGED', 'DELETED'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const RELATION_TYPES = ['PARENT_CHILD', 'SPOUSE'] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const PARENT_ROLES = ['FATHER', 'MOTHER', 'UNKNOWN'] as const;
export type ParentRole = (typeof PARENT_ROLES)[number];

export const CHILD_KINDS = ['BIOLOGICAL', 'ADOPTED', 'STEP', 'FOSTER', 'UNKNOWN'] as const;
export type ChildKind = (typeof CHILD_KINDS)[number];

export const SPOUSE_KINDS = ['MARRIED', 'PARTNER', 'UNKNOWN'] as const;
export type SpouseKind = (typeof SPOUSE_KINDS)[number];

export const CERTAINTIES = ['CERTAIN', 'PROBABLE', 'DISPUTED'] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export const EVENT_TYPES = ['BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'OTHER'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SOURCE_TYPES = ['IMAGE', 'TEXT', 'ORAL', 'BOOK', 'TOMBSTONE', 'GEDCOM'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const TRANSCRIPTION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] as const;
export type TranscriptionStatus = (typeof TRANSCRIPTION_STATUSES)[number];

export const PRECISIONS = ['YEAR', 'MONTH', 'DAY', 'UNKNOWN'] as const;
export type Precision = (typeof PRECISIONS)[number];

export const CALENDARS = ['SOLAR', 'LUNAR', 'UNKNOWN'] as const;
export type Calendar = (typeof CALENDARS)[number];

export const CITATION_TARGET_TYPES = ['PERSON', 'RELATION', 'EVENT'] as const;
export type CitationTargetType = (typeof CITATION_TARGET_TYPES)[number];

export const AI_JOB_KINDS = ['EXTRACT', 'NARRATIVE', 'KINSHIP_INTENT'] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];

export const AI_JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_PROVIDERS = ['openai-compatible', 'mock'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DRAFT_TYPES = ['PERSON', 'RELATION', 'EVENT'] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

export const DRAFT_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const NARRATIVE_STATUSES = ['DRAFT', 'CONFIRMED'] as const;
export type NarrativeStatus = (typeof NARRATIVE_STATUSES)[number];

export const ISSUE_SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ['OPEN', 'IGNORED', 'RESOLVED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const REVIEW_ACTIONS = ['MERGE_PERSON', 'DELETE_PERSON', 'DELETE_RELATION'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const GEDCOM_IMPORT_STATUSES = ['PARSED', 'PREVIEWED', 'COMMITTED', 'FAILED', 'CANCELLED'] as const;
export type GedcomImportStatus = (typeof GEDCOM_IMPORT_STATUSES)[number];
