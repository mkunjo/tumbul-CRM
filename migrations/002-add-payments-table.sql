-- =============================================
-- Add Payments Table for Partial Payments Support
-- Migration: 002
-- =============================================

-- =============================================
-- PAYMENTS TABLE
-- =============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'check', 'credit_card', 'bank_transfer', 'stripe', 'other')),
  stripe_payment_intent_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100) -- 'contractor' or 'client' or 'system'
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_date ON payments(invoice_id, payment_date DESC);

-- =============================================
-- ROW LEVEL SECURITY FOR PAYMENTS
-- =============================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Payments inherit tenant through invoice -> project
CREATE POLICY tenant_isolation_payments ON payments
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = current_setting('app.current_tenant_id')::uuid
    )
  );

-- =============================================
-- UPDATE INVOICES TABLE
-- =============================================

-- Add new status for partially paid invoices
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'canceled'));

-- =============================================
-- VIEWS FOR INVOICE BALANCES
-- =============================================

-- Create view to calculate invoice balances with payments
CREATE OR REPLACE VIEW invoice_balances AS
SELECT
  i.id as invoice_id,
  i.invoice_number,
  i.amount as total_amount,
  COALESCE(SUM(p.amount), 0) as paid_amount,
  i.amount - COALESCE(SUM(p.amount), 0) as balance,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) = 0 THEN i.status
    WHEN COALESCE(SUM(p.amount), 0) >= i.amount THEN 'paid'
    WHEN COALESCE(SUM(p.amount), 0) > 0 THEN 'partially_paid'
    ELSE i.status
  END as calculated_status,
  COUNT(p.id) as payment_count,
  MAX(p.payment_date) as last_payment_date
FROM invoices i
LEFT JOIN payments p ON i.id = p.invoice_id
GROUP BY i.id, i.invoice_number, i.amount, i.status;

-- =============================================
-- TRIGGER TO AUTO-UPDATE INVOICE STATUS
-- =============================================

-- Function to update invoice status based on payments
CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_amount DECIMAL(10, 2);
  v_total_paid DECIMAL(10, 2);
  v_invoice_status VARCHAR(50);
BEGIN
  -- Get invoice amount and current status
  SELECT amount, status INTO v_invoice_amount, v_invoice_status
  FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Calculate total paid for this invoice
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Update invoice status based on payment amount
  IF v_total_paid >= v_invoice_amount THEN
    -- Fully paid
    UPDATE invoices
    SET status = 'paid',
        paid_at = (SELECT MAX(payment_date) FROM payments WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id)
      AND status != 'paid';
  ELSIF v_total_paid > 0 AND v_invoice_status NOT IN ('canceled', 'draft') THEN
    -- Partially paid
    UPDATE invoices
    SET status = 'partially_paid',
        updated_at = NOW()
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id)
      AND status NOT IN ('partially_paid', 'canceled');
  ELSIF v_total_paid = 0 AND v_invoice_status IN ('paid', 'partially_paid') THEN
    -- No payments remaining - revert to sent
    UPDATE invoices
    SET status = 'sent',
        paid_at = NULL,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on payments table
CREATE TRIGGER update_invoice_status_after_payment
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_invoice_status_on_payment();

-- =============================================
-- MIGRATION DATA
-- =============================================

-- Migrate existing paid invoices to have payment records
-- This creates a payment record for each already-paid invoice
INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_by)
SELECT
  id,
  amount,
  COALESCE(paid_at, updated_at),
  CASE
    WHEN stripe_payment_intent_id IS NOT NULL THEN 'stripe'
    ELSE 'other'
  END,
  'Migrated from existing paid invoice',
  'system'
FROM invoices
WHERE status = 'paid' AND paid_at IS NOT NULL;

-- Update stripe_payment_intent_id in payments table
UPDATE payments p
SET stripe_payment_intent_id = i.stripe_payment_intent_id
FROM invoices i
WHERE p.invoice_id = i.id
  AND i.stripe_payment_intent_id IS NOT NULL
  AND p.created_by = 'system';
