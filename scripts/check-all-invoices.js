// Check all invoices in the system
require('dotenv').config();
const { pool } = require('../config/database');

async function checkAllInvoices() {
  try {
    console.log('📋 Checking all invoices in the system...\n');

    const result = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.amount,
        t.email as tenant_email,
        COALESCE(SUM(pay.amount), 0) as paid_amount,
        COUNT(pay.id) as payment_count
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN tenants t ON p.tenant_id = t.id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      GROUP BY i.id, i.invoice_number, i.status, i.amount, t.email
      ORDER BY i.created_at DESC
    `);

    console.log(`Found ${result.rows.length} invoice(s):\n`);

    result.rows.forEach(inv => {
      console.log(`${inv.invoice_number} - ${inv.status}`);
      console.log(`  Tenant: ${inv.tenant_email}`);
      console.log(`  Amount: $${inv.amount} | Paid: $${inv.paid_amount} | Payments: ${inv.payment_count}`);
      console.log('');
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkAllInvoices();
