// Unit tests for Expense Service

const expenseService = require('../services/expenseService');
const { queryWithTenant } = require('../config/database');

// Mock database and AWS modules
jest.mock('../config/database');
jest.mock('aws-sdk', () => {
  const mockS3 = {
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Key: 'test-key' })
    }),
    deleteObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    getSignedUrl: jest.fn().mockReturnValue('https://s3.example.com/signed-url')
  };

  return {
    S3: jest.fn(() => mockS3)
  };
});

describe('ExpenseService', () => {
  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockProjectId = '223e4567-e89b-12d3-a456-426614174000';
  const mockExpenseId = '323e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getExpenses', () => {
    it('should return paginated expenses', async () => {
      const mockExpenses = [
        {
          id: mockExpenseId,
          description: 'Lumber',
          amount: '250.00',
          category: 'materials',
          date: '2025-01-15'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: mockExpenses })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await expenseService.getExpenses(mockTenantId, {
        limit: 50,
        offset: 0
      });

      expect(result.expenses).toEqual(mockExpenses);
      expect(result.total).toBe(1);
      expect(queryWithTenant).toHaveBeenCalledTimes(2);
    });

    it('should filter by project ID', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await expenseService.getExpenses(mockTenantId, {
        projectId: mockProjectId,
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain(mockProjectId);
    });

    it('should filter by category', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await expenseService.getExpenses(mockTenantId, {
        category: 'materials',
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain('materials');
    });

    it('should filter by date range', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await expenseService.getExpenses(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain('2025-01-01');
      expect(firstCall[2]).toContain('2025-01-31');
    });

    it('should filter by client approval status', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await expenseService.getExpenses(mockTenantId, {
        clientApproved: true,
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain(true);
    });
  });

  describe('getExpenseById', () => {
    it('should return expense with details', async () => {
      const mockExpense = {
        id: mockExpenseId,
        description: 'Lumber',
        amount: '250.00',
        category: 'materials',
        client_name: 'John Doe'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockExpense] });

      const result = await expenseService.getExpenseById(mockTenantId, mockExpenseId);

      expect(result).toEqual(mockExpense);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.any(String),
        [mockTenantId, mockExpenseId]
      );
    });

    it('should throw error if expense not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        expenseService.getExpenseById(mockTenantId, mockExpenseId)
      ).rejects.toThrow('Expense not found');
    });
  });

  describe('createExpense', () => {
    it('should create expense without receipt', async () => {
      const mockExpenseData = {
        projectId: mockProjectId,
        description: 'Lumber',
        amount: 250.00,
        category: 'materials',
        date: '2025-01-15',
        notes: 'Test note'
      };

      const mockCreatedExpense = {
        id: mockExpenseId,
        ...mockExpenseData
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // Project check
        .mockResolvedValueOnce({ rows: [mockCreatedExpense] }); // Insert

      const result = await expenseService.createExpense(mockTenantId, mockExpenseData);

      expect(result.description).toBe('Lumber');
      expect(result.amount).toBe(250.00);
      expect(queryWithTenant).toHaveBeenCalledTimes(2);
    });

    it('should create expense with receipt', async () => {
      const mockExpenseData = {
        projectId: mockProjectId,
        description: 'Lumber',
        amount: 250.00,
        category: 'materials'
      };

      const mockFile = {
        originalname: 'receipt.jpg',
        buffer: Buffer.from('fake-image'),
        mimetype: 'image/jpeg'
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] })
        .mockResolvedValueOnce({ rows: [{ id: mockExpenseId }] });

      const result = await expenseService.createExpense(
        mockTenantId,
        mockExpenseData,
        mockFile
      );

      expect(result.id).toBe(mockExpenseId);
    });

    it('should throw error if project not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        expenseService.createExpense(mockTenantId, {
          projectId: mockProjectId,
          description: 'Test',
          amount: 100
        })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('updateExpense', () => {
    it('should update expense fields', async () => {
      const updates = {
        amount: 300.00,
        notes: 'Updated notes'
      };

      const mockUpdatedExpense = {
        id: mockExpenseId,
        ...updates
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockExpenseId }] }) // Check exists
        .mockResolvedValueOnce({ rows: [mockUpdatedExpense] }); // Update

      const result = await expenseService.updateExpense(
        mockTenantId,
        mockExpenseId,
        updates
      );

      expect(result.amount).toBe(300.00);
      expect(result.notes).toBe('Updated notes');
    });

    it('should throw error if no valid fields provided', async () => {
      await expect(
        expenseService.updateExpense(mockTenantId, mockExpenseId, {
          invalidField: 'value'
        })
      ).rejects.toThrow('No valid fields to update');
    });

    it('should throw error if expense not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        expenseService.updateExpense(mockTenantId, mockExpenseId, { amount: 200 })
      ).rejects.toThrow('Expense not found');
    });

    it('should update receipt if file provided', async () => {
      const mockFile = {
        originalname: 'new-receipt.jpg',
        buffer: Buffer.from('fake-image'),
        mimetype: 'image/jpeg'
      };

      const mockExpense = {
        id: mockExpenseId,
        project_id: mockProjectId,
        receipt_photo_s3_key: 'old-key'
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [mockExpense] }) // getExpenseById
        .mockResolvedValueOnce({ rows: [mockExpense] }) // Check exists
        .mockResolvedValueOnce({ rows: [{ ...mockExpense }] }); // Update

      const result = await expenseService.updateExpense(
        mockTenantId,
        mockExpenseId,
        { amount: 250 },
        mockFile
      );

      expect(result.id).toBe(mockExpenseId);
    });
  });

  describe('deleteExpense', () => {
    it('should delete expense and receipt', async () => {
      const mockExpense = {
        id: mockExpenseId,
        receipt_photo_s3_key: 'test-key'
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [mockExpense] }) // getExpenseById
        .mockResolvedValueOnce({ rows: [mockExpense] }); // Delete

      const result = await expenseService.deleteExpense(mockTenantId, mockExpenseId);

      expect(result.success).toBe(true);
      expect(result.id).toBe(mockExpenseId);
    });

    it('should throw error if expense not found', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockExpenseId }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        expenseService.deleteExpense(mockTenantId, mockExpenseId)
      ).rejects.toThrow('Expense not found');
    });
  });

  describe('approveExpense', () => {
    it('should approve expense', async () => {
      const mockExpense = {
        id: mockExpenseId,
        client_approved: true
      };

      queryWithTenant.mockResolvedValue({ rows: [mockExpense] });

      const result = await expenseService.approveExpense(mockTenantId, mockExpenseId);

      expect(result.client_approved).toBe(true);
    });

    it('should throw error if expense not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        expenseService.approveExpense(mockTenantId, mockExpenseId)
      ).rejects.toThrow('Expense not found');
    });
  });

  describe('getProjectExpenses', () => {
    it('should return all expenses for a project', async () => {
      const mockExpenses = [
        { id: '1', description: 'Lumber', amount: '250.00' },
        { id: '2', description: 'Nails', amount: '50.00' }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockExpenses });

      const result = await expenseService.getProjectExpenses(
        mockTenantId,
        mockProjectId
      );

      expect(result).toEqual(mockExpenses);
      expect(result.length).toBe(2);
    });
  });

  describe('getExpenseStats', () => {
    it('should return expense statistics', async () => {
      const mockStats = {
        total_expenses: '15',
        approved_count: '10',
        pending_approval_count: '5',
        with_receipt_count: '12',
        total_amount: '5000.00',
        approved_amount: '3500.00',
        average_amount: '333.33'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await expenseService.getExpenseStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_expenses).toBe('15');
      expect(result.total_amount).toBe('5000.00');
    });

    it('should filter stats by project', async () => {
      queryWithTenant.mockResolvedValue({ rows: [{}] });

      await expenseService.getExpenseStats(mockTenantId, {
        projectId: mockProjectId
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain(mockProjectId);
    });

    it('should filter stats by date range', async () => {
      queryWithTenant.mockResolvedValue({ rows: [{}] });

      await expenseService.getExpenseStats(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain('2025-01-01');
      expect(call[2]).toContain('2025-01-31');
    });
  });

  describe('getExpensesByCategory', () => {
    it('should return expenses grouped by category', async () => {
      const mockCategories = [
        {
          category: 'materials',
          expense_count: '10',
          total_amount: '3000.00',
          average_amount: '300.00'
        },
        {
          category: 'labor',
          expense_count: '5',
          total_amount: '2000.00',
          average_amount: '400.00'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockCategories });

      const result = await expenseService.getExpensesByCategory(mockTenantId);

      expect(result).toEqual(mockCategories);
      expect(result.length).toBe(2);
    });

    it('should filter by date range', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expenseService.getExpensesByCategory(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain('2025-01-01');
      expect(call[2]).toContain('2025-01-31');
    });
  });

  describe('Receipt Management', () => {
    describe('uploadReceipt', () => {
      it('should upload receipt to S3', async () => {
        const mockFile = {
          originalname: 'receipt.jpg',
          buffer: Buffer.from('fake-image'),
          mimetype: 'image/jpeg'
        };

        const result = await expenseService.uploadReceipt(
          mockTenantId,
          mockProjectId,
          mockFile
        );

        expect(result).toHaveProperty('key');
        expect(result).toHaveProperty('url');
        expect(result.key).toContain(mockTenantId);
        expect(result.key).toContain(mockProjectId);
      });
    });

    describe('getReceiptUrl', () => {
      it('should generate signed URL', async () => {
        const url = await expenseService.getReceiptUrl('test-key', 3600);

        expect(url).toContain('s3.example.com');
      });

      it('should throw error if no key provided', async () => {
        await expect(
          expenseService.getReceiptUrl(null)
        ).rejects.toThrow('No receipt available');
      });
    });

    describe('deleteReceipt', () => {
      it('should delete receipt from S3', async () => {
        await expect(
          expenseService.deleteReceipt('test-key')
        ).resolves.not.toThrow();
      });

      it('should handle null key gracefully', async () => {
        await expect(
          expenseService.deleteReceipt(null)
        ).resolves.not.toThrow();
      });
    });
  });
});
