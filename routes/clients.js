// Client management API endpoints

const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const clientService = require('../services/clientService');
const { authenticate, checkUsageLimit } = require('../middleware/auth');

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
 * GET /api/clients
 * Get all clients with optional filtering
 */
router.get('/',
  authenticate,
  [
    query('includeArchived').optional().isBoolean().toBoolean(),
    query('search').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { includeArchived, search, limit, offset } = req.query;
      
      const result = await clientService.getClients(req.tenant.id, {
        includeArchived: includeArchived || false,
        search: search || '',
        limit: limit || 50,
        offset: offset || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Get clients error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch clients',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/clients/stats
 * Get client statistics
 */
router.get('/stats',
  authenticate,
  async (req, res) => {
    try {
      const stats = await clientService.getClientStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get client stats error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch statistics',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/clients/:id
 * Get single client by ID
 */
router.get('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const client = await clientService.getClientById(req.tenant.id, req.params.id);
      res.json(client);
    } catch (error) {
      console.error('Get client error:', error);
      const statusCode = error.message === 'Client not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to fetch client',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/clients/:id/projects
 * Get all projects for a client
 */
router.get('/:id/projects',
  authenticate,
  [
    param('id').isUUID(),
    query('status').optional().isIn(['active', 'completed', 'on_hold', 'canceled'])
  ],
  validate,
  async (req, res) => {
    try {
      const projects = await clientService.getClientProjects(
        req.tenant.id,
        req.params.id,
        { status: req.query.status }
      );
      res.json({ projects });
    } catch (error) {
      console.error('Get client projects error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch client projects',
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/clients
 * Create new client
 */
router.post('/',
  authenticate,
  checkUsageLimit('clients'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('address').optional().trim(),
    body('notes').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const client = await clientService.createClient(req.tenant.id, req.body);
      
      res.status(201).json({
        client,
        usageInfo: req.usageInfo
      });
    } catch (error) {
      console.error('Create client error:', error);
      const statusCode = error.message.includes('already exists') ? 409 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to create client',
        message: error.message 
      });
    }
  }
);

/**
 * PUT /api/clients/:id
 * Update client
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('name').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('address').optional().trim(),
    body('notes').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const client = await clientService.updateClient(
        req.tenant.id,
        req.params.id,
        req.body
      );
      
      res.json(client);
    } catch (error) {
      console.error('Update client error:', error);
      const statusCode = error.message === 'Client not found' ? 404 :
                         error.message.includes('already exists') ? 409 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to update client',
        message: error.message 
      });
    }
  }
);

/**
 * PATCH /api/clients/:id/archive
 * Archive client (soft delete)
 */
router.patch('/:id/archive',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const client = await clientService.archiveClient(req.tenant.id, req.params.id);
      res.json({
        message: 'Client archived successfully',
        client
      });
    } catch (error) {
      console.error('Archive client error:', error);
      const statusCode = error.message === 'Client not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to archive client',
        message: error.message 
      });
    }
  }
);

/**
 * PATCH /api/clients/:id/restore
 * Restore archived client
 */
router.patch('/:id/restore',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const client = await clientService.restoreClient(req.tenant.id, req.params.id);
      res.json({
        message: 'Client restored successfully',
        client
      });
    } catch (error) {
      console.error('Restore client error:', error);
      const statusCode = error.message === 'Client not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to restore client',
        message: error.message 
      });
    }
  }
);

/**
 * DELETE /api/clients/:id
 * Permanently delete client (only if no projects)
 */
router.delete('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      await clientService.deleteClient(req.tenant.id, req.params.id);
      res.json({ 
        success: true,
        message: 'Client deleted successfully' 
      });
    } catch (error) {
      console.error('Delete client error:', error);
      const statusCode = error.message === 'Client not found' ? 404 :
                         error.message.includes('Cannot delete') ? 409 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to delete client',
        message: error.message 
      });
    }
  }
);

module.exports = router;