-- DropIndex
DROP INDEX "AiDraft_jobId_idx";

-- DropIndex
DROP INDEX "AuditLog_entityType_entityId_idx";

-- DropIndex
DROP INDEX "AuditLog_action_idx";

-- DropIndex
DROP INDEX "AuditLog_actorId_idx";

-- DropIndex
DROP INDEX "ConsistencyIssue_status_severity_idx";

-- DropIndex
DROP INDEX "Event_relationId_idx";

-- DropIndex
DROP INDEX "Event_personId_idx";

-- DropIndex
DROP INDEX "Relation_personBId_idx";

-- DropIndex
DROP INDEX "Relation_personAId_idx";

-- CreateIndex
CREATE INDEX "AiDraft_jobId_status_idx" ON "AiDraft"("jobId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsistencyIssue_status_severity_lastSeenAt_idx" ON "ConsistencyIssue"("status", "severity", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Event_personId_type_idx" ON "Event"("personId", "type");

-- CreateIndex
CREATE INDEX "Event_relationId_type_idx" ON "Event"("relationId", "type");

-- CreateIndex
CREATE INDEX "Relation_personAId_type_idx" ON "Relation"("personAId", "type");

-- CreateIndex
CREATE INDEX "Relation_personBId_type_idx" ON "Relation"("personBId", "type");
