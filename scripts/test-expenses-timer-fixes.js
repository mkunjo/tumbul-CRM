/**
 * Test Script: Expenses and Timer Module Fixes
 *
 * Tests all the fixes applied to both modules:
 * - Expenses: 8 field name and endpoint fixes
 * - Timer: 2 field name fixes + 3 API endpoint fixes
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Test credentials (use existing test user or create one)
const TEST_USER = {
  email: 'test@example.com',
  password: 'test123456'
};

let authToken = null;
let testProjectId = null;
let testExpenseId = null;
let testTimerEntryId = null;

// Helper function for API calls
async function apiCall(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
    };
  }
}

// Test functions
async function testLogin() {
  console.log('\n📝 Test 1: User Login');
  const result = await apiCall('POST', '/api/auth/login', TEST_USER);

  if (result.success && result.data.token) {
    authToken = result.data.token;
    console.log('✅ Login successful');
    return true;
  } else {
    console.log('⚠️  Login failed (this is OK if user doesn\'t exist)');
    console.log('   Creating test user...');

    // Try to register
    const registerResult = await apiCall('POST', '/api/auth/register', {
      ...TEST_USER,
      name: 'Test User'
    });

    if (registerResult.success && registerResult.data.token) {
      authToken = registerResult.data.token;
      console.log('✅ User created and logged in');
      return true;
    }

    console.log('❌ Cannot proceed without authentication');
    return false;
  }
}

async function setupTestProject() {
  console.log('\n📝 Setting up test project...');

  // Get or create a client first
  const clientsResult = await apiCall('GET', '/api/clients');
  let clientId;

  if (clientsResult.success && clientsResult.data.length > 0) {
    clientId = clientsResult.data[0].id;
    console.log(`✅ Using existing client: ${clientsResult.data[0].name}`);
  } else {
    const createClientResult = await apiCall('POST', '/api/clients', {
      name: 'Test Client',
      email: 'testclient@example.com',
      phone: '555-1234',
      company: 'Test Company'
    });

    if (createClientResult.success) {
      clientId = createClientResult.data.id;
      console.log('✅ Created test client');
    } else {
      console.log('❌ Failed to create client:', createClientResult.error);
      return false;
    }
  }

  // Get or create a project
  const projectsResult = await apiCall('GET', '/api/projects');

  if (projectsResult.success && projectsResult.data.length > 0) {
    testProjectId = projectsResult.data[0].id;
    console.log(`✅ Using existing project: ${projectsResult.data[0].title}`);
    return true;
  } else {
    const createProjectResult = await apiCall('POST', '/api/projects', {
      clientId: clientId,
      title: 'Test Project',
      description: 'Project for testing expenses and timer',
      status: 'active'
    });

    if (createProjectResult.success) {
      testProjectId = createProjectResult.data.id;
      console.log('✅ Created test project');
      return true;
    } else {
      console.log('❌ Failed to create project:', createProjectResult.error);
      return false;
    }
  }
}

// EXPENSES MODULE TESTS
async function testExpenseCreate() {
  console.log('\n📝 Test 2: Create Expense (Fixed API)');
  const result = await apiCall('POST', '/api/expenses', {
    projectId: testProjectId,
    category: 'materials',
    amount: 150.50,
    date: new Date().toISOString().split('T')[0],
    description: 'Test expense - materials purchase',
    notes: 'Testing fixed expense creation'
  });

  if (result.success) {
    // Fixed: Backend returns flat response.data.id, not response.data.expense.id
    testExpenseId = result.data.id;
    console.log('✅ Expense created successfully');
    console.log(`   ID: ${testExpenseId}`);
    console.log(`   Amount: $${result.data.amount}`);
    return true;
  } else {
    console.log('❌ Failed to create expense:', result.error);
    return false;
  }
}

async function testExpenseGetAll() {
  console.log('\n📝 Test 3: Get All Expenses (Field Names)');
  const result = await apiCall('GET', '/api/expenses');

  if (result.success && result.data.length > 0) {
    const expense = result.data[0];
    console.log('✅ Expenses retrieved successfully');

    // Check for correct field names (backend sends these)
    const hasCorrectFields =
      expense.hasOwnProperty('date') &&          // NOT expense_date
      expense.hasOwnProperty('project_title') && // NOT project_name
      expense.hasOwnProperty('client_approved'); // NOT approval_status

    if (hasCorrectFields) {
      console.log('✅ All field names are correct:');
      console.log(`   - date: ${expense.date}`);
      console.log(`   - project_title: ${expense.project_title}`);
      console.log(`   - client_approved: ${expense.client_approved}`);
      return true;
    } else {
      console.log('⚠️  Field name mismatch detected:');
      console.log('   Available fields:', Object.keys(expense));
      return false;
    }
  } else {
    console.log('❌ Failed to get expenses:', result.error || 'No expenses found');
    return false;
  }
}

async function testExpenseApproval() {
  console.log('\n📝 Test 4: Approve Expense (Fixed Endpoint)');
  if (!testExpenseId) {
    console.log('⚠️  Skipping - no expense to approve');
    return false;
  }

  // Fixed: Endpoint is /api/expenses/:id/approve (not /approval)
  const result = await apiCall('PATCH', `/api/expenses/${testExpenseId}/approve`);

  if (result.success) {
    console.log('✅ Expense approved successfully');
    console.log(`   client_approved: ${result.data.client_approved}`);
    return true;
  } else {
    console.log('❌ Failed to approve expense:', result.error);
    return false;
  }
}

async function testExpenseFilterByApproval() {
  console.log('\n📝 Test 5: Filter Expenses by Approval (Fixed Params)');

  // Fixed: Use clientApproved=true (boolean), not approval_status='approved' (string)
  const result = await apiCall('GET', '/api/expenses?clientApproved=true');

  if (result.success) {
    console.log('✅ Filtered approved expenses successfully');
    console.log(`   Found ${result.data.length} approved expense(s)`);

    // Verify all returned expenses are approved
    const allApproved = result.data.every(exp => exp.client_approved === true);
    if (allApproved) {
      console.log('✅ All expenses are correctly approved');
      return true;
    } else {
      console.log('⚠️  Some expenses are not approved in results');
      return false;
    }
  } else {
    console.log('❌ Failed to filter expenses:', result.error);
    return false;
  }
}

// TIMER MODULE TESTS
async function testTimerStart() {
  console.log('\n📝 Test 6: Start Timer (Fixed Endpoint)');

  // Fixed: Endpoint is /api/time-entries/start (not /api/time-entries/timer/start)
  const result = await apiCall('POST', '/api/time-entries/start', {
    projectId: testProjectId,
    description: 'Testing timer functionality'
  });

  if (result.success) {
    testTimerEntryId = result.data.timeEntry?.id || result.data.id;
    console.log('✅ Timer started successfully');
    console.log(`   Entry ID: ${testTimerEntryId}`);
    console.log(`   Description: ${result.data.timeEntry?.description || result.data.description}`);
    return true;
  } else {
    console.log('❌ Failed to start timer:', result.error);
    return false;
  }
}

async function testTimerGetRunning() {
  console.log('\n📝 Test 7: Get Running Timer (Fixed Endpoint)');

  // Fixed: Endpoint is /api/time-entries/running (not /api/time-entries/timer/running)
  const result = await apiCall('GET', '/api/time-entries/running');

  if (result.success) {
    if (result.data) {
      console.log('✅ Running timer retrieved successfully');

      // Check for correct field names
      const hasProjectTitle = result.data.hasOwnProperty('project_title'); // NOT project_name

      if (hasProjectTitle) {
        console.log('✅ Field names are correct:');
        console.log(`   - project_title: ${result.data.project_title}`);
        return true;
      } else {
        console.log('⚠️  Field name mismatch - expected project_title');
        console.log('   Available fields:', Object.keys(result.data));
        return false;
      }
    } else {
      console.log('⚠️  No running timer (this might be OK)');
      return true;
    }
  } else {
    console.log('❌ Failed to get running timer:', result.error);
    return false;
  }
}

async function testTimerStop() {
  console.log('\n📝 Test 8: Stop Timer (Fixed Method)');

  if (!testTimerEntryId) {
    console.log('⚠️  Skipping - no timer to stop');
    return false;
  }

  // Fixed: Method is PATCH (not POST), endpoint is /api/time-entries/:id/stop
  const result = await apiCall('PATCH', `/api/time-entries/${testTimerEntryId}/stop`);

  if (result.success) {
    console.log('✅ Timer stopped successfully');
    console.log(`   Duration: ${result.data.duration_minutes || 'N/A'} minutes`);
    return true;
  } else {
    console.log('❌ Failed to stop timer:', result.error);
    return false;
  }
}

async function testTimeEntriesGetAll() {
  console.log('\n📝 Test 9: Get All Time Entries (Field Names)');
  const result = await apiCall('GET', '/api/time-entries');

  if (result.success && result.data.length > 0) {
    const entry = result.data[0];
    console.log('✅ Time entries retrieved successfully');

    // Check for correct field names
    const hasProjectTitle = entry.hasOwnProperty('project_title'); // NOT project_name

    if (hasProjectTitle) {
      console.log('✅ Field names are correct:');
      console.log(`   - project_title: ${entry.project_title}`);
      return true;
    } else {
      console.log('⚠️  Field name mismatch:');
      console.log('   Available fields:', Object.keys(entry));
      return false;
    }
  } else {
    console.log('❌ Failed to get time entries:', result.error || 'No entries found');
    return false;
  }
}

// Cleanup
async function cleanup() {
  console.log('\n📝 Cleanup: Removing test data...');

  if (testExpenseId) {
    await apiCall('DELETE', `/api/expenses/${testExpenseId}`);
    console.log('✅ Test expense deleted');
  }

  if (testTimerEntryId) {
    await apiCall('DELETE', `/api/time-entries/${testTimerEntryId}`);
    console.log('✅ Test time entry deleted');
  }
}

// Main test runner
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXPENSES & TIMER MODULE FIXES - TEST SUITE');
  console.log('═══════════════════════════════════════════════════════');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  // Authentication
  if (!await testLogin()) {
    console.log('\n❌ Cannot proceed without authentication');
    return;
  }

  // Setup
  if (!await setupTestProject()) {
    console.log('\n❌ Cannot proceed without test project');
    return;
  }

  // Run all tests
  const tests = [
    testExpenseCreate,
    testExpenseGetAll,
    testExpenseApproval,
    testExpenseFilterByApproval,
    testTimerStart,
    testTimerGetRunning,
    testTimerStop,
    testTimeEntriesGetAll
  ];

  for (const test of tests) {
    try {
      const result = await test();
      if (result === true) {
        results.passed++;
      } else if (result === false) {
        results.failed++;
      } else {
        results.skipped++;
      }
    } catch (error) {
      console.log(`❌ Test error: ${error.message}`);
      results.failed++;
    }
  }

  // Cleanup
  await cleanup();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Passed:  ${results.passed}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⚠️  Skipped: ${results.skipped}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (results.failed === 0) {
    console.log('🎉 All tests passed! Both modules are working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.\n');
  }
}

// Run tests
runAllTests().catch(console.error);
