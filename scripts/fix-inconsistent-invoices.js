// Fix invoices with inconsistent states (status='paid' but no payment records)
require('dotenv').config();
const { pool } = require('../config/database');

async function fixInconsistentInvoices() {
  try {
    console.log('🔧 Finding and fixing inconsistent invoices...\n');

    // Find all invoices with status='paid' but no payment records
    const findQuery = `
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.amount,
        i.paid_at,
        p.tenant_id,
        COALESCE(SUM(pay.amount), 0) as paid_amount,
        COUNT(pay.id) as payment_count
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      WHERE i.status = 'paid'
      GROUP BY i.id, i.invoice_number, i.status, i.amount, i.paid_at, p.tenant_id
      HAVING COALESCE(SUM(pay.amount), 0) = 0
    `;

    const result = await pool.query(findQuery);

    if (result.rows.length === 0) {
      console.log('✅ No inconsistent invoices found. All paid invoices have payment records.');
      await pool.end();
      return;
    }

    console.log(`Found ${result.rows.length} invoice(s) with status='paid' but no payment records:\n`);

    for (const invoice of result.rows) {
      console.log(`📋 Invoice: ${invoice.invoice_number}`);
      console.log(`   ID: ${invoice.id}`);
      console.log(`   Amount: $${invoice.amount}`);
      console.log(`   Status: ${invoice.status}`);
      console.log(`   Payments: ${invoice.payment_count}`);

      // Option 1: Create a payment record for the full amount
      console.log('   Fix: Creating payment record for full amount...');

      const insertPayment = `
        INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const paymentResult = await pool.query(insertPayment, [
        invoice.id,
        invoice.amount,
        invoice.paid_at || new Date(),
        'other',
        'Auto-created payment record to fix inconsistent state (invoice was marked paid without payment record)',
        'system'
      ]);

      console.log(`   ✅ Created payment record: $${paymentResult.rows[0].amount}`);
      console.log('');
    }

    console.log(`\n✅ Fixed ${result.rows.length} invoice(s)\n`);

    // Verify the fix
    console.log('🔍 Verifying fix...\n');
    const verifyResult = await pool.query(findQuery);

    if (verifyResult.rows.length === 0) {
      console.log('✅ All invoices are now consistent!\n');
    } else {
      console.log(`⚠️  Still found ${verifyResult.rows.length} inconsistent invoice(s)\n`);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

fixInconsistentInvoices();
