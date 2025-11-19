// Fix the trigger to handle payment deletions properly
require('dotenv').config();
const { pool } = require('../config/database');

async function fixTrigger() {
  const client = await pool.connect();

  try {
    console.log('Fixing trigger function...');

    const sql = `
-- Fix trigger to handle status reversion when payments are deleted
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
    `;

    await client.query(sql);

    console.log('✓ Trigger function fixed successfully');
  } catch (error) {
    console.error('✗ Fix failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixTrigger().catch(err => {
  console.error(err);
  process.exit(1);
});
