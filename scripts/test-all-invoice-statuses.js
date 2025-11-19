// Comprehensive test of all invoice status transitions
require('dotenv').config();
const { pool, queryWithTenant } = require('../config/database');
const invoiceService = require('../services/invoiceService');

async function testAllStatuses() {
  let tenantId, clientId, projectId;

  try {
    console.log('🧪 Testing ALL invoice status transitions...\n');

    // Setup test data with unique email
    const timestamp = Date.now();
    const tenant = await pool.query(
      `INSERT INTO tenants (email, password_hash, company_name, subscription_plan)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`status-test-${timestamp}@test.com`, 'hash', 'Status Test Co', 'pro']
    );
    tenantId = tenant.rows[0].id;

    const client = await queryWithTenant(
      tenantId,
      `INSERT INTO clients (tenant_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, 'Test Client', 'client@test.com']
    );
    clientId = client.rows[0].id;

    const project = await queryWithTenant(
      tenantId,
      `INSERT INTO projects (tenant_id, client_id, title, status, total_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, clientId, 'Test Project', 'active', 10000]
    );
    projectId = project.rows[0].id;

    console.log('✅ Test environment created\n');

    // Test 1: Create invoice (draft)
    console.log('📝 TEST 1: Create invoice');
    const invoice = await invoiceService.createInvoice(tenantId, {
      projectId: projectId,
      amount: 5000.00,
      notes: 'Test invoice for status transitions'
    });
    console.log(`   Status: ${invoice.status} ✅ (expected: draft)`);
    if (invoice.status !== 'draft') throw new Error('Expected draft status');

    // Test 2: Mark as sent
    console.log('\n📝 TEST 2: Mark as sent');
    const sent = await invoiceService.markAsSent(tenantId, invoice.id);
    console.log(`   Status: ${sent.status} ✅ (expected: sent)`);
    if (sent.status !== 'sent') throw new Error('Expected sent status');

    // Test 3: Record partial payment
    console.log('\n📝 TEST 3: Record partial payment ($2000)');
    const payment1 = await invoiceService.recordPayment(tenantId, invoice.id, {
      amount: 2000.00,
      payment_method: 'check'
    });
    console.log(`   Status: ${payment1.invoice.status} ✅ (expected: partially_paid)`);
    console.log(`   Paid: $${payment1.invoice.paid_amount}`);
    console.log(`   Balance: $${payment1.invoice.balance}`);
    if (payment1.invoice.status !== 'partially_paid') throw new Error('Expected partially_paid status');

    // Test 4: Record another partial payment
    console.log('\n📝 TEST 4: Record another partial payment ($1500)');
    const payment2 = await invoiceService.recordPayment(tenantId, invoice.id, {
      amount: 1500.00,
      payment_method: 'cash'
    });
    console.log(`   Status: ${payment2.invoice.status} ✅ (expected: still partially_paid)`);
    console.log(`   Paid: $${payment2.invoice.paid_amount}`);
    console.log(`   Balance: $${payment2.invoice.balance}`);
    if (payment2.invoice.status !== 'partially_paid') throw new Error('Expected partially_paid status');

    // Test 5: Complete payment
    console.log('\n📝 TEST 5: Complete payment ($1500)');
    const payment3 = await invoiceService.recordPayment(tenantId, invoice.id, {
      amount: 1500.00,
      payment_method: 'credit_card'
    });
    console.log(`   Status: ${payment3.invoice.status} ✅ (expected: paid)`);
    console.log(`   Paid: $${payment3.invoice.paid_amount}`);
    console.log(`   Balance: $${payment3.invoice.balance}`);
    if (payment3.invoice.status !== 'paid') throw new Error('Expected paid status');

    // Test 6: Test markAsPaid on partially_paid invoice
    console.log('\n📝 TEST 6: Test markAsPaid on partially_paid invoice');
    const invoice2 = await invoiceService.createInvoice(tenantId, {
      projectId: projectId,
      amount: 3000.00
    });
    await invoiceService.markAsSent(tenantId, invoice2.id);
    await invoiceService.recordPayment(tenantId, invoice2.id, {
      amount: 1000.00,
      payment_method: 'check'
    });
    const markedPaid = await invoiceService.markAsPaid(tenantId, invoice2.id);
    console.log(`   Status: ${markedPaid.status} ✅ (expected: paid)`);
    if (markedPaid.status !== 'paid') throw new Error('markAsPaid should work on partially_paid');

    // Test 7: Test invoice statistics
    console.log('\n📝 TEST 7: Test invoice statistics');
    const stats = await invoiceService.getInvoiceStats(tenantId);
    console.log(`   Total invoices: ${stats.total_invoices}`);
    console.log(`   Draft: ${stats.draft_count}`);
    console.log(`   Sent: ${stats.sent_count}`);
    console.log(`   Partially Paid: ${stats.partially_paid_count}`);
    console.log(`   Paid: ${stats.paid_count}`);
    console.log(`   Overdue: ${stats.overdue_count}`);
    console.log(`   Canceled: ${stats.canceled_count}`);
    if (!('partially_paid_count' in stats)) throw new Error('Stats missing partially_paid_count');

    // Test 8: Test overdue with partial payment
    console.log('\n📝 TEST 8: Test overdue with partial payment');
    const overdueInvoice = await queryWithTenant(
      tenantId,
      `INSERT INTO invoices (project_id, invoice_number, amount, status, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [projectId, 'INV-TEST-OVERDUE', 2000.00, 'sent', '2024-01-01']
    );
    await invoiceService.recordPayment(tenantId, overdueInvoice.rows[0].id, {
      amount: 500.00,
      payment_method: 'cash'
    });
    await invoiceService.updateOverdueInvoices(tenantId);
    const overdueCheck = await invoiceService.getInvoiceById(tenantId, overdueInvoice.rows[0].id);
    console.log(`   Status: ${overdueCheck.status} ✅ (expected: overdue)`);
    if (overdueCheck.status !== 'overdue') throw new Error('Expected overdue status');

    // Test 9: Test cancel
    console.log('\n📝 TEST 9: Test cancel invoice');
    const cancelInvoice = await invoiceService.createInvoice(tenantId, {
      projectId: projectId,
      amount: 1000.00
    });
    await invoiceService.markAsSent(tenantId, cancelInvoice.id);
    const canceled = await invoiceService.cancelInvoice(tenantId, cancelInvoice.id);
    console.log(`   Status: ${canceled.status} ✅ (expected: canceled)`);
    if (canceled.status !== 'canceled') throw new Error('Expected canceled status');

    // Test 10: Verify payment cannot be recorded on canceled invoice
    console.log('\n📝 TEST 10: Verify payment blocked on canceled invoice');
    try {
      await invoiceService.recordPayment(tenantId, cancelInvoice.id, {
        amount: 500.00,
        payment_method: 'cash'
      });
      throw new Error('Should have blocked payment on canceled invoice');
    } catch (error) {
      if (error.message.includes('Cannot record payment for canceled invoice')) {
        console.log(`   ✅ Correctly blocked: ${error.message}`);
      } else {
        throw error;
      }
    }

    // Test 11: Verify payment cannot be recorded on draft invoice
    console.log('\n📝 TEST 11: Verify payment blocked on draft invoice');
    const draftInvoice = await invoiceService.createInvoice(tenantId, {
      projectId: projectId,
      amount: 1000.00
    });
    try {
      await invoiceService.recordPayment(tenantId, draftInvoice.id, {
        amount: 500.00,
        payment_method: 'cash'
      });
      throw new Error('Should have blocked payment on draft invoice');
    } catch (error) {
      if (error.message.includes('Cannot record payment for draft invoice')) {
        console.log(`   ✅ Correctly blocked: ${error.message}`);
      } else {
        throw error;
      }
    }

    console.log('\n\n✅ ALL TESTS PASSED! Invoice status handling is working correctly.\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    if (tenantId) {
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
    await pool.end();
  }
}

testAllStatuses();
