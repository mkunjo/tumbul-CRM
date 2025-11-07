// Unit tests for Portal Service

const portalService = require('../services/portalService');
const { queryWithTenant } = require('../config/database');

// Mock database module
jest.mock('../config/database');

describe('PortalService', () => {
  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockClientId = '987e6543-e21b-12d3-a456-426614174000';
  const mockProjectId = '456e7890-e12b-34c5-d678-901234567890';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePortalToken', () => {
    it('should generate a secure SHA256 token', () => {
      const token = portalService.generatePortalToken(mockClientId, mockTenantId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // SHA256 produces 64 hex characters
    });

    it('should generate unique tokens for different timestamps', () => {
      const token1 = portalService.generatePortalToken(mockClientId, mockTenantId);

      // Wait a bit to ensure different timestamp
      jest.advanceTimersByTime(10);

      const token2 = portalService.generatePortalToken(mockClientId, mockTenantId);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyClientAccess', () => {
    it('should return true when client has access to project', async () => {
      queryWithTenant.mockResolvedValue({
        rows: [{ id: mockProjectId }]
      });

      const result = await portalService.verifyClientAccess(
        mockTenantId,
        mockClientId,
        mockProjectId
      );

      expect(result).toBe(true);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('FROM projects p'),
        [mockTenantId, mockClientId, mockProjectId]
      );
    });

    it('should return false when client does not have access', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      const result = await portalService.verifyClientAccess(
        mockTenantId,
        mockClientId,
        mockProjectId
      );

      expect(result).toBe(false);
    });
  });

  describe('getClientInfo', () => {
    it('should return client information', async () => {
      const mockClient = {
        id: mockClientId,
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockClient] });

      const result = await portalService.getClientInfo(mockTenantId, mockClientId);

      expect(result).toEqual(mockClient);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('FROM clients'),
        [mockTenantId, mockClientId]
      );
    });

    it('should throw error when client not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.getClientInfo(mockTenantId, mockClientId)
      ).rejects.toThrow('Client not found');
    });
  });

  describe('getClientProjects', () => {
    it('should return all client projects with aggregated data', async () => {
      const mockProjects = [
        {
          id: mockProjectId,
          title: 'Kitchen Renovation',
          description: 'Complete kitchen remodel',
          status: 'active',
          start_date: '2025-01-01',
          estimated_completion: '2025-02-01',
          total_amount: '10000.00',
          photo_count: '5',
          invoice_count: '2',
          paid_invoice_count: '1',
          total_paid: '5000.00',
          amount_due: '5000.00'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockProjects });

      const result = await portalService.getClientProjects(mockTenantId, mockClientId);

      expect(result).toEqual(mockProjects);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('FROM projects p'),
        [mockTenantId, mockClientId]
      );
    });

    it('should only return auto-shared photos in count', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await portalService.getClientProjects(mockTenantId, mockClientId);

      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('ph.auto_shared = true'),
        [mockTenantId, mockClientId]
      );
    });
  });

  describe('getProjectDetails', () => {
    it('should return project details when access is granted', async () => {
      const mockProject = {
        id: mockProjectId,
        title: 'Kitchen Renovation',
        description: 'Complete kitchen remodel',
        status: 'active',
        start_date: '2025-01-01',
        estimated_completion: '2025-02-01',
        total_amount: '10000.00'
      };

      // Mock access verification
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: [mockProject] }); // getProjectDetails

      const result = await portalService.getProjectDetails(
        mockTenantId,
        mockClientId,
        mockProjectId
      );

      expect(result).toEqual(mockProject);
    });

    it('should throw error when access is denied', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.getProjectDetails(mockTenantId, mockClientId, mockProjectId)
      ).rejects.toThrow('Access denied');
    });

    it('should throw error when project not found', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: [] }); // getProjectDetails

      await expect(
        portalService.getProjectDetails(mockTenantId, mockClientId, mockProjectId)
      ).rejects.toThrow('Project not found');
    });
  });

  describe('getProjectPhotos', () => {
    it('should return only auto-shared photos', async () => {
      const mockPhotos = [
        {
          id: '1',
          filename: 'photo1.jpg',
          s3_url: 'https://s3.example.com/photo1.jpg',
          caption: 'Kitchen before',
          uploaded_at: '2025-01-01T10:00:00Z'
        },
        {
          id: '2',
          filename: 'photo2.jpg',
          s3_url: 'https://s3.example.com/photo2.jpg',
          caption: 'Kitchen after',
          uploaded_at: '2025-01-15T10:00:00Z'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: mockPhotos }); // getProjectPhotos

      const result = await portalService.getProjectPhotos(
        mockTenantId,
        mockClientId,
        mockProjectId
      );

      expect(result).toEqual(mockPhotos);
      expect(queryWithTenant).toHaveBeenLastCalledWith(
        mockTenantId,
        expect.stringContaining('ph.auto_shared = true'),
        [mockTenantId, mockProjectId]
      );
    });

    it('should throw error when access is denied', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.getProjectPhotos(mockTenantId, mockClientId, mockProjectId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getProjectInvoices', () => {
    it('should return invoices excluding drafts', async () => {
      const mockInvoices = [
        {
          id: '1',
          invoice_number: 'INV-20250101-0001',
          amount: '5000.00',
          status: 'paid',
          due_date: '2025-01-15',
          paid_at: '2025-01-14',
          created_at: '2025-01-01'
        },
        {
          id: '2',
          invoice_number: 'INV-20250115-0001',
          amount: '5000.00',
          status: 'sent',
          due_date: '2025-02-15',
          paid_at: null,
          created_at: '2025-01-15'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: mockInvoices }); // getProjectInvoices

      const result = await portalService.getProjectInvoices(
        mockTenantId,
        mockClientId,
        mockProjectId
      );

      expect(result).toEqual(mockInvoices);
      expect(queryWithTenant).toHaveBeenLastCalledWith(
        mockTenantId,
        expect.stringContaining("i.status != 'draft'"),
        [mockTenantId, mockProjectId]
      );
    });

    it('should throw error when access is denied', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.getProjectInvoices(mockTenantId, mockClientId, mockProjectId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getProjectExpenses', () => {
    it('should return all project expenses', async () => {
      const mockExpenses = [
        {
          id: '1',
          description: 'Materials',
          amount: '500.00',
          category: 'materials',
          date: '2025-01-10',
          receipt_photo_url: 'https://example.com/receipt1.jpg',
          client_approved: true,
          notes: 'Approved by client'
        },
        {
          id: '2',
          description: 'Labor',
          amount: '1000.00',
          category: 'labor',
          date: '2025-01-15',
          receipt_photo_url: null,
          client_approved: false,
          notes: 'Pending approval'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: mockExpenses }); // getProjectExpenses

      const result = await portalService.getProjectExpenses(
        mockTenantId,
        mockClientId,
        mockProjectId
      );

      expect(result).toEqual(mockExpenses);
    });

    it('should throw error when access is denied', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.getProjectExpenses(mockTenantId, mockClientId, mockProjectId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getProjectTimeline', () => {
    it('should return combined timeline of photos, invoices, and expenses', async () => {
      const mockTimeline = [
        {
          type: 'photo',
          id: '1',
          timestamp: '2025-01-15T10:00:00Z',
          description: 'Photo uploaded',
          details: 'Kitchen progress'
        },
        {
          type: 'invoice',
          id: '2',
          timestamp: '2025-01-14T10:00:00Z',
          description: 'Invoice paid',
          details: 'INV-20250101-0001 - $5000.00'
        },
        {
          type: 'expense',
          id: '3',
          timestamp: '2025-01-10T10:00:00Z',
          description: 'Expense approved',
          details: 'Materials - $500.00'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: mockTimeline }); // getProjectTimeline

      const result = await portalService.getProjectTimeline(
        mockTenantId,
        mockClientId,
        mockProjectId,
        { limit: 50 }
      );

      expect(result).toEqual(mockTimeline);
      expect(result.length).toBe(3);
    });

    it('should respect custom limit parameter', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // verifyClientAccess
        .mockResolvedValueOnce({ rows: [] }); // getProjectTimeline

      await portalService.getProjectTimeline(
        mockTenantId,
        mockClientId,
        mockProjectId,
        { limit: 10 }
      );

      expect(queryWithTenant).toHaveBeenLastCalledWith(
        mockTenantId,
        expect.any(String),
        [mockProjectId, 10]
      );
    });

    it('should throw error when access is denied', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.getProjectTimeline(mockTenantId, mockClientId, mockProjectId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getClientSummary', () => {
    it('should return aggregated client statistics', async () => {
      const mockSummary = {
        total_projects: '5',
        active_projects: '2',
        completed_projects: '3',
        total_paid: '25000.00',
        amount_due: '10000.00',
        total_photos: '50'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockSummary] });

      const result = await portalService.getClientSummary(mockTenantId, mockClientId);

      expect(result).toEqual(mockSummary);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('COUNT(DISTINCT p.id)'),
        [mockTenantId, mockClientId]
      );
    });

    it('should only count auto-shared photos in summary', async () => {
      queryWithTenant.mockResolvedValue({ rows: [{}] });

      await portalService.getClientSummary(mockTenantId, mockClientId);

      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('ph.auto_shared = true'),
        [mockTenantId, mockClientId]
      );
    });
  });

  describe('approveExpense', () => {
    it('should approve an expense successfully', async () => {
      const mockExpense = {
        id: '1',
        description: 'Materials',
        amount: '500.00',
        category: 'materials',
        client_approved: true
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: '1' }] }) // verifyQuery
        .mockResolvedValueOnce({ rows: [mockExpense] }); // updateQuery

      const result = await portalService.approveExpense(
        mockTenantId,
        mockClientId,
        '1'
      );

      expect(result).toEqual(mockExpense);
      expect(result.client_approved).toBe(true);
    });

    it('should throw error when expense not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.approveExpense(mockTenantId, mockClientId, '1')
      ).rejects.toThrow('Expense not found or already approved');
    });

    it('should throw error when expense already approved', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] }); // No rows = already approved or not found

      await expect(
        portalService.approveExpense(mockTenantId, mockClientId, '1')
      ).rejects.toThrow('Expense not found or already approved');
    });

    it('should verify expense belongs to client project', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        portalService.approveExpense(mockTenantId, mockClientId, '1')
      ).rejects.toThrow();

      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('p.client_id = $2'),
        expect.arrayContaining([mockTenantId, mockClientId, '1'])
      );
    });
  });
});
