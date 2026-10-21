-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "courtesyName" TEXT,
    "alias" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "livingStatus" TEXT NOT NULL DEFAULT 'LIVING',
    "birthYear" INTEGER,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "birthDateText" TEXT,
    "birthPrecision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "birthApproximate" BOOLEAN NOT NULL DEFAULT false,
    "birthCalendar" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "birthPlace" TEXT,
    "deathYear" INTEGER,
    "deathMonth" INTEGER,
    "deathDay" INTEGER,
    "deathDateText" TEXT,
    "deathPrecision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "deathApproximate" BOOLEAN NOT NULL DEFAULT false,
    "deathCalendar" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "deathPlace" TEXT,
    "occupation" TEXT,
    "biography" TEXT,
    "generation" INTEGER,
    "branch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Person_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "parentRole" TEXT,
    "childKind" TEXT,
    "spouseKind" TEXT,
    "certainty" TEXT NOT NULL DEFAULT 'CERTAIN',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Relation_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Relation_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "personId" TEXT,
    "relationId" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "day" INTEGER,
    "dateText" TEXT,
    "precision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "calendar" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "place" TEXT,
    "description" TEXT,
    "certainty" TEXT NOT NULL DEFAULT 'CERTAIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "Relation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "fileHash" TEXT,
    "storagePath" TEXT,
    "rawText" TEXT,
    "transcriptionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "page" TEXT,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Citation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "maskedInput" TEXT,
    "maskMap" TEXT,
    "outputJson" TEXT,
    "errorMessage" TEXT,
    "statsJson" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "draftType" TEXT NOT NULL,
    "tempId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "sourceQuote" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "warningsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "appliedEntityType" TEXT,
    "appliedEntityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiDraft_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AiJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiDraft_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Narrative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectPersonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "paramsJson" TEXT,
    "contentJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Narrative_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Narrative_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Narrative_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsistencyIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detailsJson" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ignoreReason" TEXT,
    "ignoredById" TEXT,
    "ignoredAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "diffJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionComment" TEXT,
    "expectedVersionsJson" TEXT NOT NULL,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReviewRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GedcomImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PARSED',
    "fileHash" TEXT NOT NULL,
    "previewJson" TEXT,
    "mappingJson" TEXT,
    "statsJson" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "committedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GedcomImport_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GedcomImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GedcomXref" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "xref" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GedcomXref_importId_fkey" FOREIGN KEY ("importId") REFERENCES "GedcomImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Person_familyId_status_idx" ON "Person"("familyId", "status");

-- CreateIndex
CREATE INDEX "Person_surname_givenName_idx" ON "Person"("surname", "givenName");

-- CreateIndex
CREATE INDEX "Person_alias_idx" ON "Person"("alias");

-- CreateIndex
CREATE INDEX "Person_generation_idx" ON "Person"("generation");

-- CreateIndex
CREATE INDEX "Person_branch_idx" ON "Person"("branch");

-- CreateIndex
CREATE INDEX "Person_birthYear_idx" ON "Person"("birthYear");

-- CreateIndex
CREATE INDEX "Person_deathYear_idx" ON "Person"("deathYear");

-- CreateIndex
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE INDEX "Relation_personAId_idx" ON "Relation"("personAId");

-- CreateIndex
CREATE INDEX "Relation_personBId_idx" ON "Relation"("personBId");

-- CreateIndex
CREATE INDEX "Relation_type_idx" ON "Relation"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Relation_type_personAId_personBId_key" ON "Relation"("type", "personAId", "personBId");

-- CreateIndex
CREATE INDEX "Event_personId_idx" ON "Event"("personId");

-- CreateIndex
CREATE INDEX "Event_relationId_idx" ON "Event"("relationId");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_year_idx" ON "Event"("year");

-- CreateIndex
CREATE INDEX "Source_fileHash_idx" ON "Source"("fileHash");

-- CreateIndex
CREATE INDEX "Source_type_idx" ON "Source"("type");

-- CreateIndex
CREATE INDEX "Source_createdAt_idx" ON "Source"("createdAt");

-- CreateIndex
CREATE INDEX "Citation_sourceId_idx" ON "Citation"("sourceId");

-- CreateIndex
CREATE INDEX "Citation_targetType_targetId_idx" ON "Citation"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Citation_fieldPath_idx" ON "Citation"("fieldPath");

-- CreateIndex
CREATE INDEX "AiJob_sourceId_idx" ON "AiJob"("sourceId");

-- CreateIndex
CREATE INDEX "AiJob_status_idx" ON "AiJob"("status");

-- CreateIndex
CREATE INDEX "AiJob_inputHash_idx" ON "AiJob"("inputHash");

-- CreateIndex
CREATE INDEX "AiJob_createdAt_idx" ON "AiJob"("createdAt");

-- CreateIndex
CREATE INDEX "AiDraft_jobId_idx" ON "AiDraft"("jobId");

-- CreateIndex
CREATE INDEX "AiDraft_status_idx" ON "AiDraft"("status");

-- CreateIndex
CREATE INDEX "AiDraft_reviewedById_idx" ON "AiDraft"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "AiDraft_jobId_draftType_tempId_key" ON "AiDraft"("jobId", "draftType", "tempId");

-- CreateIndex
CREATE INDEX "Narrative_subjectPersonId_idx" ON "Narrative"("subjectPersonId");

-- CreateIndex
CREATE INDEX "Narrative_status_idx" ON "Narrative"("status");

-- CreateIndex
CREATE INDEX "Narrative_createdById_idx" ON "Narrative"("createdById");

-- CreateIndex
CREATE INDEX "Narrative_confirmedById_idx" ON "Narrative"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "ConsistencyIssue_dedupeKey_key" ON "ConsistencyIssue"("dedupeKey");

-- CreateIndex
CREATE INDEX "ConsistencyIssue_status_severity_idx" ON "ConsistencyIssue"("status", "severity");

-- CreateIndex
CREATE INDEX "ConsistencyIssue_code_idx" ON "ConsistencyIssue"("code");

-- CreateIndex
CREATE INDEX "ConsistencyIssue_entityType_entityId_idx" ON "ConsistencyIssue"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ConsistencyIssue_lastSeenAt_idx" ON "ConsistencyIssue"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_status_idx" ON "ReviewRequest"("status");

-- CreateIndex
CREATE INDEX "ReviewRequest_action_idx" ON "ReviewRequest"("action");

-- CreateIndex
CREATE INDEX "ReviewRequest_requestedById_idx" ON "ReviewRequest"("requestedById");

-- CreateIndex
CREATE INDEX "ReviewRequest_createdAt_idx" ON "ReviewRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "GedcomImport_fileHash_idx" ON "GedcomImport"("fileHash");

-- CreateIndex
CREATE INDEX "GedcomImport_status_idx" ON "GedcomImport"("status");

-- CreateIndex
CREATE INDEX "GedcomImport_sourceId_idx" ON "GedcomImport"("sourceId");

-- CreateIndex
CREATE INDEX "GedcomImport_createdById_idx" ON "GedcomImport"("createdById");

-- CreateIndex
CREATE INDEX "GedcomXref_entityType_entityId_idx" ON "GedcomXref"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "GedcomXref_importId_xref_key" ON "GedcomXref"("importId", "xref");
