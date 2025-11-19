// Prepare the draft invoice for payment by marking it as sent
require('dotenv').config();
const { pool } = require('../config/database');

async function prepareInvoice() {
  try {
    console.log('📝 Preparing invoice for payment...\n');

    const invoiceId = '6dd7afb9-8e0e-432f-87b3-250e84f2805d';
    const tenantId = '4325e182-1313-4849-83a5-5930c5853efb';

    // Mark invoice as sent
    const result = await pool.query(`
      UPDATE invoices
      SET status = 'sent', updated_at = NOW()
      WHERE id = $1
      RETURNING id, invoice_number, status, amount
    `, [invoiceId]);

    if (result.rows.length > 0) {
      const invoice = result.rows[0];
      console.log('✅ Invoice updated successfully!');
      console.log(`   Invoice: ${invoice.invoice_number}`);
      console.log(`   Status: ${invoice.status}`);
      console.log(`   Amount: $${invoice.amount}`);
      console.log('\n✨ You can now record payments on this invoice!');
    } else {
      console.log('❌ Invoice not found');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

prepareInvoice();
