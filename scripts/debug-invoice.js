// Debug script to check invoice status and tenant access
require('dotenv').config();
const { pool, queryWithTenant } = require('../config/database');

async function debugInvoice() {
  try {
    console.log('🔍 Debugging invoice payment issue...\n');

    // Get all invoices with their current status
    const allInvoices = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.amount,
        p.tenant_id,
        p.id as project_id,
        p.title as project_title,
        c.name as client_name,
        COALESCE(SUM(pay.amount), 0) as paid_amount
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      GROUP BY i.id, p.tenant_id, p.id, p.title, c.name
      ORDER BY i.created_at DESC
      LIMIT 10
    `);

    console.log('📋 Recent Invoices:');
    console.log('=====================================');

    if (allInvoices.rows.length === 0) {
      console.log('No invoices found in database!\n');
    } else {
      allInvoices.rows.forEach(inv => {
        console.log(`\nInvoice: ${inv.invoice_number}`);
        console.log(`  ID: ${inv.id}`);
        console.log(`  Status: ${inv.status}`);
        console.log(`  Amount: $${inv.amount}`);
        console.log(`  Paid: $${inv.paid_amount}`);
        console.log(`  Balance: $${parseFloat(inv.amount) - parseFloat(inv.paid_amount)}`);
        console.log(`  Tenant: ${inv.tenant_id}`);
        console.log(`  Project: ${inv.project_title}`);
        console.log(`  Client: ${inv.client_name}`);

        // Check if it can be marked as paid
        const canMarkPaid = ['sent', 'overdue', 'partially_paid'].includes(inv.status);
        console.log(`  Can mark as paid? ${canMarkPaid ? '✅ YES' : '❌ NO (status: ' + inv.status + ')'}`);
      });
    }

    console.log('\n\n🔑 Checking for partially_paid invoices specifically:');
    const partiallyPaid = await pool.query(`
      SELECT i.id, i.invoice_number, i.status
      FROM invoices i
      WHERE i.status = 'partially_paid'
    `);

    if (partiallyPaid.rows.length > 0) {
      console.log(`Found ${partiallyPaid.rows.length} partially paid invoice(s):`);
      partiallyPaid.rows.forEach(inv => {
        console.log(`  - ${inv.invoice_number} (${inv.id})`);
      });
    } else {
      console.log('No partially_paid invoices found.');
    }

    console.log('\n\n💡 To test a payment, use this invoice ID:');
    if (allInvoices.rows.length > 0) {
      const testable = allInvoices.rows.find(inv =>
        ['sent', 'overdue', 'partially_paid'].includes(inv.status)
      );

      if (testable) {
        console.log(`Invoice ID: ${testable.id}`);
        console.log(`Tenant ID: ${testable.tenant_id}`);
        console.log(`Current Status: ${testable.status}`);
        console.log(`Remaining Balance: $${parseFloat(testable.amount) - parseFloat(testable.paid_amount)}`);
      } else {
        console.log('No invoices available for payment (all are draft, paid, or canceled)');
      }
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

debugInvoice();
