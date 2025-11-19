// Check the current state of your invoice
require('dotenv').config();
const { pool } = require('../config/database');

async function checkInvoice() {
  try {
    console.log('🔍 Checking current invoice state...\n');

    // Get the invoice you're trying to update
    const result = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.amount,
        i.paid_at,
        p.tenant_id,
        p.id as project_id,
        p.title as project_title,
        c.name as client_name,
        COALESCE(SUM(pay.amount), 0) as paid_amount
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      WHERE i.invoice_number = 'INV-20251107-0001'
      GROUP BY i.id, p.tenant_id, p.id, p.title, c.name
    `);

    if (result.rows.length === 0) {
      console.log('❌ Invoice INV-20251107-0001 not found');
      return;
    }

    const invoice = result.rows[0];
    console.log('📄 Invoice Details:');
    console.log('==================');
    console.log(`ID: ${invoice.id}`);
    console.log(`Number: ${invoice.invoice_number}`);
    console.log(`Status: ${invoice.status}`);
    console.log(`Amount: $${invoice.amount}`);
    console.log(`Paid: $${invoice.paid_amount}`);
    console.log(`Balance: $${parseFloat(invoice.amount) - parseFloat(invoice.paid_amount)}`);
    console.log(`Tenant ID: ${invoice.tenant_id}`);
    console.log(`Project: ${invoice.project_title}`);
    console.log(`Client: ${invoice.client_name}`);

    console.log('\n✅ Valid Status Transitions:');
    console.log('============================');

    const currentStatus = invoice.status;
    const validTransitions = {
      'draft': ['sent'],
      'sent': ['partially_paid (via payment)', 'paid (via payment or markAsPaid)', 'overdue (if past due)', 'canceled'],
      'partially_paid': ['paid (via payment or markAsPaid)', 'overdue (if past due)', 'canceled'],
      'paid': ['none - invoice is complete'],
      'overdue': ['paid (via payment or markAsPaid)', 'canceled'],
      'canceled': ['none - invoice is canceled']
    };

    console.log(`From "${currentStatus}":`);
    (validTransitions[currentStatus] || ['unknown']).forEach(t => {
      console.log(`  → ${t}`);
    });

    console.log('\n🔑 Can this invoice accept payments?');
    const canAcceptPayments = ['sent', 'partially_paid', 'overdue'].includes(currentStatus);
    console.log(canAcceptPayments ? '✅ YES' : '❌ NO');

    if (!canAcceptPayments) {
      console.log(`\n⚠️  Reason: Status is "${currentStatus}"`);
      if (currentStatus === 'draft') {
        console.log('   Action needed: Mark as "sent" first');
      } else if (currentStatus === 'paid') {
        console.log('   Invoice is already fully paid');
      } else if (currentStatus === 'canceled') {
        console.log('   Invoice is canceled and cannot accept payments');
      }
    }

    console.log('\n🔍 Can markAsPaid be used?');
    const canMarkPaid = ['sent', 'overdue', 'partially_paid'].includes(currentStatus);
    console.log(canMarkPaid ? '✅ YES' : '❌ NO');

    // Check if there are any payments
    const paymentsResult = await pool.query(`
      SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC
    `, [invoice.id]);

    console.log(`\n💰 Payments: ${paymentsResult.rows.length} payment(s) recorded`);
    paymentsResult.rows.forEach((payment, i) => {
      console.log(`  ${i + 1}. $${payment.amount} - ${payment.payment_method} (${new Date(payment.payment_date).toLocaleDateString()})`);
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
  }
}

checkInvoice();
