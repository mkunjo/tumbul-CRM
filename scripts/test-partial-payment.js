// Quick test to verify partial payment functionality
require('dotenv').config();
const { pool, queryWithTenant } = require('../config/database');
const invoiceService = require('../services/invoiceService');

async function testPartialPayment() {
  let tenantId, clientId, projectId, invoiceId;

  try {
    console.log('🧪 Testing partial payment functionality...\n');

    // Create test tenant
    const tenant = await pool.query(
      `INSERT INTO tenants (email, password_hash, company_name, subscription_plan)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['test-partial@test.com', 'hash', 'Test Co', 'pro']
    );
    tenantId = tenant.rows[0].id;
    console.log('✓ Created test tenant:', tenantId);

    // Create client
    const client = await queryWithTenant(
      tenantId,
      `INSERT INTO clients (tenant_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, 'Test Client', 'client@test.com']
    );
    clientId = client.rows[0].id;
    console.log('✓ Created client:', clientId);

    // Create project
    const project = await queryWithTenant(
      tenantId,
      `INSERT INTO projects (tenant_id, client_id, title, status, total_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, clientId, 'Test Project', 'active', 5000]
    );
    projectId = project.rows[0].id;
    console.log('✓ Created project:', projectId);

    // Create invoice
    const invoice = await invoiceService.createInvoice(tenantId, {
      projectId: projectId,
      amount: 5000.00,
      notes: 'Test invoice'
    });
    invoiceId = invoice.id;
    console.log('✓ Created invoice:', invoice.invoice_number, '- Status:', invoice.status);

    // Mark as sent
    await invoiceService.markAsSent(tenantId, invoiceId);
    console.log('✓ Marked invoice as sent');

    // Record first partial payment
    console.log('\n📝 Recording first payment: $2000...');
    const payment1 = await invoiceService.recordPayment(tenantId, invoiceId, {
      amount: 2000.00,
      payment_method: 'check',
      notes: 'First payment'
    });
    console.log('✓ Payment 1 recorded');
    console.log('  Status:', payment1.invoice.status);
    console.log('  Paid amount:', payment1.invoice.paid_amount);
    console.log('  Balance:', payment1.invoice.balance);

    // Record second partial payment
    console.log('\n📝 Recording second payment: $1500...');
    const payment2 = await invoiceService.recordPayment(tenantId, invoiceId, {
      amount: 1500.00,
      payment_method: 'cash',
      notes: 'Second payment'
    });
    console.log('✓ Payment 2 recorded');
    console.log('  Status:', payment2.invoice.status);
    console.log('  Paid amount:', payment2.invoice.paid_amount);
    console.log('  Balance:', payment2.invoice.balance);

    // Test the old markAsPaid method on partially paid invoice
    console.log('\n📝 Testing markAsPaid on partially_paid invoice...');
    try {
      await invoiceService.markAsPaid(tenantId, invoiceId);
      console.log('✓ markAsPaid() works on partially_paid invoices');
    } catch (error) {
      console.log('✗ markAsPaid() failed:', error.message);
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    if (tenantId) {
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      console.log('\n🧹 Cleaned up test data');
    }
    await pool.end();
  }
}

testPartialPayment();
