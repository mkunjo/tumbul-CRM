require('dotenv').config();
const pool = require('../config/database');

async function checkTimeEntries() {
  try {
    console.log('🔍 Checking time entries for mkunjo121@gmail.com...\n');

    const tenantId = '4325e182-1313-4849-83a5-5930c5853efb';

    // Get all time entries for this tenant
    const result = await pool.query(
      `SELECT
        te.id,
        te.description,
        te.start_time,
        te.end_time,
        te.duration_minutes,
        te.project_id
      FROM time_entries te
      WHERE te.tenant_id = $1
      ORDER BY te.start_time DESC`,
      [tenantId]
    );

    console.log(`📊 Total Time Entries: ${result.rows.length}\n`);

    if (result.rows.length > 0) {
      result.rows.forEach((entry, index) => {
        const isRunning = !entry.end_time;
        console.log(`${index + 1}. ${isRunning ? '▶️ RUNNING' : '✅ STOPPED'}`);
        console.log(`   ID: ${entry.id}`);
        console.log(`   Description: ${entry.description || 'No description'}`);
        console.log(`   Project ID: ${entry.project_id || 'No project'}`);
        console.log(`   Started: ${entry.start_time}`);
        console.log(`   Ended: ${entry.end_time || 'Still running'}`);
        console.log(`   Duration: ${entry.duration_minutes || 0} minutes`);
        console.log('');
      });

      // Check for running timers
      const runningTimers = result.rows.filter(r => !r.end_time);
      if (runningTimers.length > 0) {
        console.log(`⚠️  Warning: ${runningTimers.length} timer(s) currently running`);
      } else {
        console.log('✅ No running timers');
      }
    } else {
      console.log('No time entries found for this tenant');
    }

  } catch (error) {
    console.error('Error checking time entries:', error);
  } finally {
    process.exit(0);
  }
}

checkTimeEntries();
