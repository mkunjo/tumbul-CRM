-- Migration 003: Performance and Concurrency Improvements
-- Date: 2025-11-11
-- Purpose: Fix invoice number race condition and add performance indexes

-- ============================================================================
-- 1. CREATE SEQUENCE FOR INVOICE NUMBERS (Fixes Race Condition)
-- ============================================================================

-- Create a sequence for generating invoice numbers
-- This ensures no two invoices can get the same number, even under concurrent load
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE
  CACHE 10; -- Cache 10 numbers for better performance

-- Grant usage to the application user
-- GRANT USAGE, SELECT ON SEQUENCE invoice_number_seq TO your_app_user;

COMMENT ON SEQUENCE invoice_number_seq IS 'Sequence for generating unique invoice numbers across all tenants';

-- ============================================================================
-- 2. ADD PERFORMANCE INDEXES
-- ============================================================================

-- Critical for multi-tenant queries
-- These indexes ensure fast lookups when filtering by tenant_id
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id
  ON projects(tenant_id);

CREATE INDEX IF NOT EXISTS idx_clients_tenant_id
  ON clients(tenant_id);

-- Invoice-related indexes
-- Composite index for common query pattern: filter by project (tenant) and status
CREATE INDEX IF NOT EXISTS idx_invoices_project_status
  ON invoices(project_id, status);

-- Index for invoice number lookups (must be unique and fast)
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON invoices(invoice_number);

-- Partial index for overdue invoice queries (only indexes relevant rows)
-- This is much more efficient than indexing all invoices
CREATE INDEX IF NOT EXISTS idx_invoices_overdue
  ON invoices(due_date, status)
  WHERE status IN ('sent', 'partially_paid', 'overdue');

-- Index for invoice status filtering (very common operation)
CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices(status);

-- Index for date-based queries and sorting
CREATE INDEX IF NOT EXISTS idx_invoices_created_at
  ON invoices(created_at DESC);

-- Payment-related indexes
-- Critical for JOIN operations and payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON payments(invoice_id);

-- Index for payment date sorting and filtering
CREATE INDEX IF NOT EXISTS idx_payments_payment_date
  ON payments(payment_date DESC);

-- Time entry indexes (for related modules)
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id
  ON time_entries(project_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_date
  ON time_entries(entry_date DESC);

-- Expense indexes (for related modules)
CREATE INDEX IF NOT EXISTS idx_expenses_project_id
  ON expenses(project_id);

CREATE INDEX IF NOT EXISTS idx_expenses_date
  ON expenses(expense_date DESC);

-- ============================================================================
-- 3. ANALYZE TABLES FOR QUERY PLANNER
-- ============================================================================

-- Update statistics for the query planner to make better decisions
ANALYZE invoices;
ANALYZE payments;
ANALYZE projects;
ANALYZE clients;
ANALYZE time_entries;
ANALYZE expenses;

-- ============================================================================
-- 4. ADD HELPFUL COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_invoices_project_status IS 'Optimizes tenant-filtered invoice queries with status filtering';
COMMENT ON INDEX idx_invoices_invoice_number IS 'Ensures fast lookup of invoices by invoice number';
COMMENT ON INDEX idx_invoices_overdue IS 'Partial index for efficient overdue invoice queries (only indexes unpaid invoices)';
COMMENT ON INDEX idx_payments_invoice_id IS 'Optimizes payment lookups and JOIN operations with invoices';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- You can run these queries to verify the indexes are being used:
/*

-- 1. Check that indexes exist
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'payments', 'projects', 'clients')
ORDER BY tablename, indexname;

-- 2. Check index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'payments', 'projects', 'clients')
ORDER BY pg_relation_size(indexrelid) DESC;

-- 3. Verify query uses indexes (should show "Index Scan" not "Seq Scan")
EXPLAIN ANALYZE
SELECT * FROM invoices
WHERE invoice_number = 'INV-20251111-0001';

-- 4. Check sequence current value
SELECT last_value FROM invoice_number_seq;

*/

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*

-- To rollback this migration, run:

DROP INDEX IF EXISTS idx_projects_tenant_id;
DROP INDEX IF EXISTS idx_clients_tenant_id;
DROP INDEX IF EXISTS idx_invoices_project_status;
DROP INDEX IF EXISTS idx_invoices_invoice_number;
DROP INDEX IF EXISTS idx_invoices_overdue;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoices_created_at;
DROP INDEX IF EXISTS idx_payments_invoice_id;
DROP INDEX IF EXISTS idx_payments_payment_date;
DROP INDEX IF EXISTS idx_time_entries_project_id;
DROP INDEX IF EXISTS idx_time_entries_date;
DROP INDEX IF EXISTS idx_expenses_project_id;
DROP INDEX IF EXISTS idx_expenses_date;

DROP SEQUENCE IF EXISTS invoice_number_seq;

*/
