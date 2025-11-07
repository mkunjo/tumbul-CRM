// Time entry management API endpoints

const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const timeEntryService = require('../services/timeEntryService');
const { authenticate } = require('../middleware/auth');

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * GET /api/time-entries
 * Get all time entries with optional filtering
 */
router.get('/',
  authenticate,
  [
    query('projectId').optional().isUUID(),
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate(),
    query('isRunning').optional().isBoolean().toBoolean(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId, startDate, endDate, isRunning, limit, offset } = req.query;

      const result = await timeEntryService.getTimeEntries(req.tenant.id, {
        projectId: projectId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        isRunning: isRunning !== undefined ? isRunning : null,
        limit: limit || 50,
        offset: offset || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Get time entries error:', error);
      res.status(500).json({
        error: 'Failed to fetch time entries',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/time-entries/stats
 * Get time entry statistics
 */
router.get('/stats',
  authenticate,
  [
    query('projectId').optional().isUUID(),
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId, startDate, endDate } = req.query;

      const stats = await timeEntryService.getTimeEntryStats(req.tenant.id, {
        projectId: projectId || null,
        startDate: startDate || null,
        endDate: endDate || null
      });

      res.json(stats);
    } catch (error) {
      console.error('Get time entry stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/time-entries/by-project
 * Get time entries grouped by project
 */
router.get('/by-project',
  authenticate,
  [
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ],
  validate,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const projects = await timeEntryService.getTimeEntriesByProject(req.tenant.id, {
        startDate: startDate || null,
        endDate: endDate || null
      });

      res.json({ projects });
    } catch (error) {
      console.error('Get time entries by project error:', error);
      res.status(500).json({
        error: 'Failed to fetch time entries by project',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/time-entries/daily-summary
 * Get daily time summary
 */
router.get('/daily-summary',
  authenticate,
  [
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ],
  validate,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const summary = await timeEntryService.getDailySummary(req.tenant.id, {
        startDate: startDate || null,
        endDate: endDate || null
      });

      res.json({ summary });
    } catch (error) {
      console.error('Get daily summary error:', error);
      res.status(500).json({
        error: 'Failed to fetch daily summary',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/time-entries/running
 * Get currently running timer
 */
router.get('/running',
  authenticate,
  async (req, res) => {
    try {
      const runningTimer = await timeEntryService.getRunningTimer(req.tenant.id);

      if (!runningTimer) {
        return res.status(404).json({
          error: 'No running timer',
          message: 'No timer is currently running'
        });
      }

      // Calculate elapsed time
      const elapsedMinutes = timeEntryService.calculateElapsedMinutes(runningTimer.start_time);
      const duration = timeEntryService.formatDuration(elapsedMinutes);

      res.json({
        ...runningTimer,
        elapsed_minutes: elapsedMinutes,
        duration
      });
    } catch (error) {
      console.error('Get running timer error:', error);
      res.status(500).json({
        error: 'Failed to fetch running timer',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/time-entries/:id
 * Get single time entry by ID
 */
router.get('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const timeEntry = await timeEntryService.getTimeEntryById(req.tenant.id, req.params.id);

      // Add formatted duration if completed
      if (timeEntry.duration_minutes) {
        timeEntry.duration = timeEntryService.formatDuration(timeEntry.duration_minutes);
      }

      res.json(timeEntry);
    } catch (error) {
      console.error('Get time entry error:', error);
      const statusCode = error.message === 'Time entry not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to fetch time entry',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/time-entries/start
 * Start a new timer
 */
router.post('/start',
  authenticate,
  [
    body('projectId').isUUID().withMessage('Valid project ID is required'),
    body('description').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const timeEntry = await timeEntryService.startTimer(req.tenant.id, req.body);

      res.status(201).json({
        message: 'Timer started',
        timeEntry
      });
    } catch (error) {
      console.error('Start timer error:', error);
      const statusCode = error.message === 'Project not found' ? 404 :
                         error.message.includes('already running') ? 409 : 500;
      res.status(statusCode).json({
        error: 'Failed to start timer',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/time-entries
 * Create a manual time entry (with start and end time)
 */
router.post('/',
  authenticate,
  [
    body('projectId').isUUID().withMessage('Valid project ID is required'),
    body('startTime').isISO8601().toDate().withMessage('Valid start time is required'),
    body('endTime').isISO8601().toDate().withMessage('Valid end time is required'),
    body('description').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const timeEntry = await timeEntryService.createManualEntry(req.tenant.id, req.body);

      // Add formatted duration
      if (timeEntry.duration_minutes) {
        timeEntry.duration = timeEntryService.formatDuration(timeEntry.duration_minutes);
      }

      res.status(201).json(timeEntry);
    } catch (error) {
      console.error('Create manual time entry error:', error);
      const statusCode = error.message === 'Project not found' ? 404 :
                         error.message.includes('End time') ? 400 : 500;
      res.status(statusCode).json({
        error: 'Failed to create time entry',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/time-entries/:id/stop
 * Stop a running timer
 */
router.patch('/:id/stop',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const timeEntry = await timeEntryService.stopTimer(req.tenant.id, req.params.id);

      // Add formatted duration
      if (timeEntry.duration_minutes) {
        timeEntry.duration = timeEntryService.formatDuration(timeEntry.duration_minutes);
      }

      res.json({
        message: 'Timer stopped',
        timeEntry
      });
    } catch (error) {
      console.error('Stop timer error:', error);
      const statusCode = error.message.includes('not found or already stopped') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to stop timer',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/time-entries/:id
 * Update time entry
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('startTime').optional().isISO8601().toDate(),
    body('endTime').optional().isISO8601().toDate(),
    body('description').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      // Convert camelCase to snake_case for database
      const updates = {};
      if ('startTime' in req.body) updates.start_time = req.body.startTime;
      if ('endTime' in req.body) updates.end_time = req.body.endTime;
      if ('description' in req.body) updates.description = req.body.description;

      const timeEntry = await timeEntryService.updateTimeEntry(
        req.tenant.id,
        req.params.id,
        updates
      );

      // Add formatted duration
      if (timeEntry.duration_minutes) {
        timeEntry.duration = timeEntryService.formatDuration(timeEntry.duration_minutes);
      }

      res.json(timeEntry);
    } catch (error) {
      console.error('Update time entry error:', error);
      const statusCode = error.message === 'Time entry not found' ? 404 :
                         error.message.includes('No valid fields') ? 400 :
                         error.message.includes('End time') ? 400 : 500;
      res.status(statusCode).json({
        error: 'Failed to update time entry',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/time-entries/:id
 * Delete time entry
 */
router.delete('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      await timeEntryService.deleteTimeEntry(req.tenant.id, req.params.id);
      res.json({
        success: true,
        message: 'Time entry deleted successfully'
      });
    } catch (error) {
      console.error('Delete time entry error:', error);
      const statusCode = error.message === 'Time entry not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to delete time entry',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/time-entries/project/:projectId
 * Get all time entries for a project
 */
router.get('/project/:projectId',
  authenticate,
  [param('projectId').isUUID()],
  validate,
  async (req, res) => {
    try {
      const timeEntries = await timeEntryService.getProjectTimeEntries(
        req.tenant.id,
        req.params.projectId
      );

      // Add formatted durations
      const entriesWithDuration = timeEntries.map(entry => ({
        ...entry,
        duration: entry.duration_minutes ?
          timeEntryService.formatDuration(entry.duration_minutes) : null
      }));

      res.json({ timeEntries: entriesWithDuration });
    } catch (error) {
      console.error('Get project time entries error:', error);
      res.status(500).json({
        error: 'Failed to fetch project time entries',
        message: error.message
      });
    }
  }
);

module.exports = router;
