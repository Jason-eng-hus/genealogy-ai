-- AuditLog is append-only: updates and deletes are rejected at the database layer.
CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE');
END;

CREATE TRIGGER "AuditLog_no_delete"
BEFORE DELETE ON "AuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE');
END;
