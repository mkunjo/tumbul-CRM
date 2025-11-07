// Unit tests for Invoice Service

const invoiceService = require('../services/invoiceService');
const { queryWithTenant } = require('../config/database');

// Mock database module
jest.mock('../config/database');

describe('InvoiceService', () => {
  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockProjectId = '223e4567-e89b-12d3-a456-426614174000';
  const mockInvoiceId = '323e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateInvoiceNumber', () => {
    it('should generate first invoice number for the day', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      const invoiceNumber = await invoiceService.generateInvoiceNumber(mockTenantId);

      expect(invoiceNumber).toMatch(/^INV-\d{8}-0001$/);
    });

    it('should increment invoice number if one exists', async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      queryWithTenant.mockResolvedValue({
        rows: [{ invoice_number: `INV-${today}-0005` }]
      });

      const invoiceNumber = await invoiceService.generateInvoiceNumber(mockTenantId);

      expect(invoiceNumber).toBe(`INV-${today}-0006`);
    });
  });

  describe('getInvoices', () => {
    it('should return paginated invoices', async () => {
      const mockInvoices = [
        {
          id: mockInvoiceId,
          invoice_number: 'INV-20240101-0001',
          amount: '1500.00',
          status: 'sent'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: mockInvoices })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await invoiceService.getInvoices(mockTenantId, {
        limit: 50,
        offset: 0
      });

      expect(result.invoices).toEqual(mockInvoices);
      expect(result.total).toBe(1);
      expect(queryWithTenant).toHaveBeenCalledTimes(2);
    });

    it('should filter by status', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await invoiceService.getInvoices(mockTenantId, {
        status: 'paid',
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[1]).toContain('paid');
    });

    it('should filter by project ID', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await invoiceService.getInvoices(mockTenantId, {
        projectId: mockProjectId,
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain(mockProjectId);
    });
  });

  describe('getInvoiceById', () => {
    it('should return invoice with details', async () => {
      const mockInvoice = {
        id: mockInvoiceId,
        invoice_number: 'INV-20240101-0001',
        amount: '1500.00',
        status: 'sent',
        client_name: 'John Doe'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockInvoice] });

      const result = await invoiceService.getInvoiceById(mockTenantId, mockInvoiceId);

      expect(result).toEqual(mockInvoice);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.any(String),
        [mockTenantId, mockInvoiceId]
      );
    });

    it('should throw error if invoice not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.getInvoiceById(mockTenantId, mockInvoiceId)
      ).rejects.toThrow('Invoice not found');
    });
  });

  describe('getInvoiceByNumber', () => {
    it('should return invoice by number', async () => {
      const mockInvoice = {
        id: mockInvoiceId,
        invoice_number: 'INV-20240101-0001'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockInvoice] });

      const result = await invoiceService.getInvoiceByNumber(
        mockTenantId,
        'INV-20240101-0001'
      );

      expect(result).toEqual(mockInvoice);
    });

    it('should throw error if invoice not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.getInvoiceByNumber(mockTenantId, 'INV-99999999-9999')
      ).rejects.toThrow('Invoice not found');
    });
  });

  describe('createInvoice', () => {
    it('should create new invoice with generated number', async () => {
      const mockInvoiceData = {
        projectId: mockProjectId,
        amount: 1500.00,
        dueDate: '2024-12-31',
        notes: 'Test invoice'
      };

      const mockCreatedInvoice = {
        id: mockInvoiceId,
        invoice_number: 'INV-20240101-0001',
        ...mockInvoiceData,
        status: 'draft'
      };

      // Mock project check
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] })
        // Mock invoice number generation
        .mockResolvedValueOnce({ rows: [] })
        // Mock insert
        .mockResolvedValueOnce({ rows: [mockCreatedInvoice] });

      const result = await invoiceService.createInvoice(mockTenantId, mockInvoiceData);

      expect(result.invoice_number).toMatch(/^INV-\d{8}-\d{4}$/);
      expect(result.status).toBe('draft');
    });

    it('should throw error if project not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.createInvoice(mockTenantId, {
          projectId: mockProjectId,
          amount: 1500.00
        })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('updateInvoice', () => {
    it('should update invoice fields', async () => {
      const updates = {
        amount: 2000.00,
        notes: 'Updated notes'
      };

      const mockUpdatedInvoice = {
        id: mockInvoiceId,
        ...updates
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockInvoiceId }] })
        .mockResolvedValueOnce({ rows: [mockUpdatedInvoice] });

      const result = await invoiceService.updateInvoice(
        mockTenantId,
        mockInvoiceId,
        updates
      );

      expect(result.amount).toBe(2000.00);
      expect(result.notes).toBe('Updated notes');
    });

    it('should throw error if no valid fields provided', async () => {
      await expect(
        invoiceService.updateInvoice(mockTenantId, mockInvoiceId, {
          invalidField: 'value'
        })
      ).rejects.toThrow('No valid fields to update');
    });

    it('should throw error if invoice not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.updateInvoice(mockTenantId, mockInvoiceId, { amount: 2000 })
      ).rejects.toThrow('Invoice not found');
    });
  });

  describe('markAsSent', () => {
    it('should mark draft invoice as sent', async () => {
      const mockInvoice = {
        id: mockInvoiceId,
        status: 'sent'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockInvoice] });

      const result = await invoiceService.markAsSent(mockTenantId, mockInvoiceId);

      expect(result.status).toBe('sent');
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining("status = 'sent'"),
        [mockTenantId, mockInvoiceId]
      );
    });

    it('should throw error if invoice already sent', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.markAsSent(mockTenantId, mockInvoiceId)
      ).rejects.toThrow('Invoice not found or already sent');
    });
  });

  describe('markAsPaid', () => {
    it('should mark sent invoice as paid', async () => {
      const mockInvoice = {
        id: mockInvoiceId,
        status: 'paid',
        paid_at: new Date()
      };

      queryWithTenant.mockResolvedValue({ rows: [mockInvoice] });

      const result = await invoiceService.markAsPaid(mockTenantId, mockInvoiceId, {
        stripePaymentIntentId: 'pi_123456'
      });

      expect(result.status).toBe('paid');
      expect(result.paid_at).toBeDefined();
    });

    it('should throw error if invoice cannot be paid', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.markAsPaid(mockTenantId, mockInvoiceId)
      ).rejects.toThrow('Invoice not found or cannot be marked as paid');
    });
  });

  describe('cancelInvoice', () => {
    it('should cancel unpaid invoice', async () => {
      const mockInvoice = {
        id: mockInvoiceId,
        status: 'canceled'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockInvoice] });

      const result = await invoiceService.cancelInvoice(mockTenantId, mockInvoiceId);

      expect(result.status).toBe('canceled');
    });

    it('should throw error if invoice cannot be canceled', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.cancelInvoice(mockTenantId, mockInvoiceId)
      ).rejects.toThrow('Invoice not found or cannot be canceled');
    });
  });

  describe('deleteInvoice', () => {
    it('should delete draft invoice', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockInvoiceId, status: 'draft' }] })
        .mockResolvedValueOnce({ rows: [{ id: mockInvoiceId }] });

      const result = await invoiceService.deleteInvoice(mockTenantId, mockInvoiceId);

      expect(result.success).toBe(true);
      expect(result.id).toBe(mockInvoiceId);
    });

    it('should throw error if invoice not draft', async () => {
      queryWithTenant.mockResolvedValue({
        rows: [{ id: mockInvoiceId, status: 'sent' }]
      });

      await expect(
        invoiceService.deleteInvoice(mockTenantId, mockInvoiceId)
      ).rejects.toThrow('Only draft invoices can be deleted');
    });

    it('should throw error if invoice not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        invoiceService.deleteInvoice(mockTenantId, mockInvoiceId)
      ).rejects.toThrow('Invoice not found');
    });
  });

  describe('getProjectInvoices', () => {
    it('should return all invoices for a project', async () => {
      const mockInvoices = [
        { id: '1', invoice_number: 'INV-20240101-0001' },
        { id: '2', invoice_number: 'INV-20240101-0002' }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockInvoices });

      const result = await invoiceService.getProjectInvoices(
        mockTenantId,
        mockProjectId
      );

      expect(result).toEqual(mockInvoices);
      expect(result.length).toBe(2);
    });
  });

  describe('getInvoiceStats', () => {
    it('should return invoice statistics', async () => {
      const mockStats = {
        total_invoices: '10',
        draft_count: '2',
        sent_count: '3',
        paid_count: '4',
        overdue_count: '1',
        total_amount: '15000.00',
        paid_amount: '8000.00',
        outstanding_amount: '7000.00'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await invoiceService.getInvoiceStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_invoices).toBe('10');
      expect(result.paid_amount).toBe('8000.00');
    });
  });

  describe('getOverdueInvoices', () => {
    it('should return overdue invoices', async () => {
      const mockOverdueInvoices = [
        {
          id: mockInvoiceId,
          invoice_number: 'INV-20240101-0001',
          due_date: '2024-01-01',
          client_name: 'John Doe'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockOverdueInvoices });

      const result = await invoiceService.getOverdueInvoices(mockTenantId);

      expect(result).toEqual(mockOverdueInvoices);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('due_date < CURRENT_DATE'),
        [mockTenantId]
      );
    });
  });

  describe('updateOverdueInvoices', () => {
    it('should update sent invoices past due date to overdue', async () => {
      const mockUpdatedInvoices = [
        { id: '1', invoice_number: 'INV-20240101-0001' },
        { id: '2', invoice_number: 'INV-20240101-0002' }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockUpdatedInvoices });

      const result = await invoiceService.updateOverdueInvoices(mockTenantId);

      expect(result).toEqual(mockUpdatedInvoices);
      expect(result.length).toBe(2);
    });
  });
});
