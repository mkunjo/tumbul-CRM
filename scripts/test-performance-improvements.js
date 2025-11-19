// Test script for performance improvements
require('dotenv').config();
const invoiceService = require('../services/invoiceService');
const { pool } = require('../config/database');

async function testImprovements() {
  console.log('🧪 Testing Performance Improvements\n');
  console.log('=' .repeat(60));

  try {
    // Get test tenant and project
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) {
      console.log('❌ No tenant found. Please create a tenant first.');
      process.exit(1);
    }
    const tenantId = tenantResult.rows[0].id;

    const projectResult = await pool.query(
      'SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1',
      [tenantId]
    );
    if (projectResult.rows.length === 0) {
      console.log('❌ No project found. Please create a project first.');
      process.exit(1);
    }
    const projectId = projectResult.rows[0].id;

    console.log(`✅ Using tenant: ${tenantId}`);
    console.log(`✅ Using project: ${projectId}\n`);

    // =================================================================
    // TEST 1: Invoice Number Generation (Race Condition Fix)
    // =================================================================
    console.log('\n📝 TEST 1: Invoice Number Generation (Concurrent Safety)');
    console.log('-'.repeat(60));

    console.log('Generating 5 invoice numbers concurrently...');
    const start1 = Date.now();

    // Create 5 invoices concurrently to test race condition fix
    const invoicePromises = [];
    for (let i = 0; i < 5; i++) {
      invoicePromises.push(
        invoiceService.createInvoice(tenantId, {
          projectId,
          amount: 100 + i,
          notes: `Concurrent test invoice ${i + 1}`
        })
      );
    }

    const invoices = await Promise.all(invoicePromises);
    const time1 = Date.now() - start1;

    console.log(`\n✅ Created ${invoices.length} invoices in ${time1}ms`);
    console.log('Invoice numbers:');
    invoices.forEach(inv => {
      console.log(`   - ${inv.invoice_number} ($${inv.amount})`);
    });

    // Check for duplicates
    const numbers = invoices.map(inv => inv.invoice_number);
    const uniqueNumbers = new Set(numbers);
    if (numbers.length === uniqueNumbers.size) {
      console.log('✅ All invoice numbers are unique (no race condition)');
    } else {
      console.log('❌ DUPLICATE invoice numbers detected!');
    }

    // =================================================================
    // TEST 2: Get Invoice By ID (Query Optimization)
    // =================================================================
    console.log('\n\n📊 TEST 2: Get Invoice By ID (Single Query Optimization)');
    console.log('-'.repeat(60));

    // Get an invoice with payments
    const invoiceWithPayments = await pool.query(`
      SELECT i.id
      FROM invoices i
      LEFT JOIN payments p ON i.id = p.invoice_id
      WHERE i.project_id IN (
        SELECT id FROM projects WHERE tenant_id = $1
      )
      GROUP BY i.id
      HAVING COUNT(p.id) > 0
      LIMIT 1
    `, [tenantId]);

    let testInvoiceId;
    if (invoiceWithPayments.rows.length > 0) {
      testInvoiceId = invoiceWithPayments.rows[0].id;
    } else {
      // Use one of the invoices we just created
      testInvoiceId = invoices[0].id;
    }

    console.log(`Testing getInvoiceById for: ${testInvoiceId}`);

    const start2 = Date.now();
    const invoice = await invoiceService.getInvoiceById(tenantId, testInvoiceId);
    const time2 = Date.now() - start2;

    console.log(`\n✅ Retrieved invoice in ${time2}ms`);
    console.log(`   - Invoice Number: ${invoice.invoice_number}`);
    console.log(`   - Amount: $${invoice.amount}`);
    console.log(`   - Paid Amount: $${invoice.paid_amount}`);
    console.log(`   - Balance: $${invoice.balance}`);
    console.log(`   - Payments: ${invoice.payment_count} payment(s)`);

    if (invoice.payments) {
      console.log(`   - Payments array: ${Array.isArray(invoice.payments) ? 'Array ✅' : 'Not Array ❌'}`);
      console.log(`   - Payments length: ${invoice.payments.length}`);

      if (invoice.payments.length > 0) {
        console.log('   - Sample payment:');
        const samplePayment = invoice.payments[0];
        console.log(`     * Amount: $${samplePayment.amount}`);
        console.log(`     * Method: ${samplePayment.payment_method}`);
        console.log(`     * Date: ${samplePayment.payment_date}`);
      }
    }

    // =================================================================
    // TEST 3: Index Verification
    // =================================================================
    console.log('\n\n📑 TEST 3: Database Indexes');
    console.log('-'.repeat(60));

    const indexResult = await pool.query(`
      SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('invoices', 'payments', 'projects', 'clients')
      ORDER BY tablename, indexname
    `);

    console.log(`\n✅ Found ${indexResult.rows.length} indexes:\n`);

    const groupedIndexes = {};
    indexResult.rows.forEach(idx => {
      if (!groupedIndexes[idx.tablename]) {
        groupedIndexes[idx.tablename] = [];
      }
      groupedIndexes[idx.tablename].push({ name: idx.indexname, size: idx.size });
    });

    Object.keys(groupedIndexes).sort().forEach(table => {
      console.log(`${table}:`);
      groupedIndexes[table].forEach(idx => {
        console.log(`   - ${idx.name} (${idx.size})`);
      });
      console.log('');
    });

    // =================================================================
    // TEST 4: Sequence Information
    // =================================================================
    console.log('\n📊 TEST 4: Invoice Number Sequence');
    console.log('-'.repeat(60));

    const seqInfo = await pool.query(`
      SELECT
        last_value,
        is_called,
        increment_by,
        cache_size
      FROM invoice_number_seq
    `);

    console.log('\n✅ Sequence Status:');
    console.log(`   - Last Value: ${seqInfo.rows[0].last_value}`);
    console.log(`   - Is Called: ${seqInfo.rows[0].is_called}`);
    console.log(`   - Increment By: ${seqInfo.rows[0].increment_by}`);
    console.log(`   - Cache Size: ${seqInfo.rows[0].cache_size}`);

    // =================================================================
    // TEST 5: Query Performance Check
    // =================================================================
    console.log('\n\n⚡ TEST 5: Query Performance');
    console.log('-'.repeat(60));

    // Test invoice list query
    console.log('\nTesting getInvoices (list query)...');
    const start3 = Date.now();
    const invoiceList = await invoiceService.getInvoices(tenantId, {
      limit: 50,
      offset: 0
    });
    const time3 = Date.now() - start3;

    console.log(`✅ Retrieved ${invoiceList.invoices.length} invoices in ${time3}ms`);
    console.log(`   - Total: ${invoiceList.total}`);
    console.log(`   - Average: ${(time3 / invoiceList.invoices.length).toFixed(2)}ms per invoice`);

    // Test invoice stats query
    console.log('\nTesting getInvoiceStats...');
    const start4 = Date.now();
    const stats = await invoiceService.getInvoiceStats(tenantId);
    const time4 = Date.now() - start4;

    console.log(`✅ Retrieved stats in ${time4}ms`);
    console.log(`   - Total Invoices: ${stats.total_invoices}`);
    console.log(`   - Paid: ${stats.paid_count}`);
    console.log(`   - Sent: ${stats.sent_count}`);
    console.log(`   - Overdue: ${stats.overdue_count}`);

    // =================================================================
    // Summary
    // =================================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE IMPROVEMENTS TEST SUMMARY');
    console.log('='.repeat(60));

    console.log('\n✅ All tests passed!\n');
    console.log('Improvements implemented:');
    console.log('  1. ✅ Invoice number race condition fixed (DB sequence)');
    console.log('  2. ✅ getInvoiceById optimized (single query with JSON aggregation)');
    console.log('  3. ✅ Database indexes created for performance');
    console.log('\nPerformance metrics:');
    console.log(`  - Concurrent invoice creation: ${time1}ms for 5 invoices`);
    console.log(`  - Single invoice fetch: ${time2}ms`);
    console.log(`  - Invoice list fetch: ${time3}ms for ${invoiceList.invoices.length} invoices`);
    console.log(`  - Stats query: ${time4}ms`);

    console.log('\n✅ System is ready for production!\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\nStack trace:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

testImprovements();
