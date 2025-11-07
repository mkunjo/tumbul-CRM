import { useState, useCallback } from 'react';
import { invoicesAPI } from '../services/api';
import { format } from 'date-fns';
import { useInvoices } from '../hooks/useInvoices';
import { useProjects } from '../hooks/useProjects';
import './Invoices.css';

const Invoices = () => {
  const [statusFilter, setStatusFilter] = useState('all');

  // Use SWR hooks for data fetching with caching
  const filterParams = statusFilter !== 'all' ? { status: statusFilter } : {};
  const { invoices, isLoading: invoicesLoading, mutate: mutateInvoices } = useInvoices(filterParams);
  const { projects, isLoading: projectsLoading } = useProjects();

  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [formData, setFormData] = useState({
    projectId: '',
    amount: '',
    dueDate: '',
    notes: '',
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash',
    notes: '',
  });

  const loading = invoicesLoading || projectsLoading;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      if (editingInvoice) {
        await invoicesAPI.update(editingInvoice.id, formData);
      } else {
        await invoicesAPI.create(formData);
      }
      setShowModal(false);
      resetForm();
      mutateInvoices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save invoice');
    }
  }, [editingInvoice, formData, mutateInvoices]);

  const handlePaymentSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      await invoicesAPI.recordPayment(selectedInvoice.id, paymentData);
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      resetPaymentForm();
      mutateInvoices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record payment');
    }
  }, [selectedInvoice, paymentData, mutateInvoices]);

  const handleStatusChange = useCallback(async (id, status) => {
    try {
      await invoicesAPI.updateStatus(id, status);
      mutateInvoices();
    } catch (err) {
      alert('Failed to update status');
    }
  }, [mutateInvoices]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      // Optimistic update
      mutateInvoices(
        invoices.filter((inv) => inv.id !== id),
        false
      );
      await invoicesAPI.delete(id);
      mutateInvoices();
    } catch (err) {
      alert('Failed to delete invoice');
      mutateInvoices();
    }
  }, [invoices, mutateInvoices]);

  const openEditModal = useCallback((invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      projectId: invoice.project_id || '',
      amount: invoice.amount || '',
      dueDate: invoice.due_date ? invoice.due_date.split('T')[0] : '',
      notes: invoice.notes || '',
    });
    setShowModal(true);
  }, []);

  const openPaymentModal = useCallback((invoice) => {
    setSelectedInvoice(invoice);
    const remaining = (invoice.total_amount || 0) - (invoice.paid_amount || 0);
    setPaymentData({
      amount: remaining.toFixed(2),
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'cash',
      notes: '',
    });
    setShowPaymentModal(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      projectId: '',
      amount: '',
      dueDate: '',
      notes: '',
    });
    setEditingInvoice(null);
  }, []);

  const resetPaymentForm = useCallback(() => {
    setPaymentData({
      amount: '',
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'cash',
      notes: '',
    });
  }, []);


  const getStatusBadge = useCallback((status) => {
    const badges = {
      draft: 'secondary',
      sent: 'primary',
      paid: 'success',
      overdue: 'danger',
      canceled: 'danger',
    };
    return `badge badge-${badges[status] || 'secondary'}`;
  }, []);

  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  }, []);

  if (loading && !invoices && !projects) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="invoices-page">
      <div className="page-header">
        <h1>Invoices</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + Create Invoice
        </button>
      </div>

      <div className="page-filters">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-tab ${statusFilter === 'draft' ? 'active' : ''}`}
            onClick={() => setStatusFilter('draft')}
          >
            Draft
          </button>
          <button
            className={`filter-tab ${statusFilter === 'sent' ? 'active' : ''}`}
            onClick={() => setStatusFilter('sent')}
          >
            Sent
          </button>
          <button
            className={`filter-tab ${statusFilter === 'paid' ? 'active' : ''}`}
            onClick={() => setStatusFilter('paid')}
          >
            Paid
          </button>
          <button
            className={`filter-tab ${statusFilter === 'overdue' ? 'active' : ''}`}
            onClick={() => setStatusFilter('overdue')}
          >
            Overdue
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {invoices && invoices.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <div className="invoice-number">{invoice.invoice_number}</div>
                    </td>
                    <td>{invoice.client_name}</td>
                    <td>{invoice.project_name || '-'}</td>
                    <td className="amount-cell">{formatCurrency(invoice.total_amount)}</td>
                    <td className="amount-cell">{formatCurrency(invoice.paid_amount)}</td>
                    <td>{invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '-'}</td>
                    <td>
                      <select
                        className={`status-select ${getStatusBadge(invoice.status)}`}
                        value={invoice.status}
                        onChange={(e) => handleStatusChange(invoice.id, e.target.value)}
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="canceled">Canceled</option>
                      </select>
                    </td>
                    <td>
                      <div className="table-actions">
                        {invoice.status !== 'paid' && invoice.status !== 'canceled' && (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => openPaymentModal(invoice)}
                          >
                            Record Payment
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openEditModal(invoice)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(invoice.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">💰</div>
              <h3>No invoices found</h3>
              <p>Create your first invoice to get started</p>
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                + Create Invoice
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal invoice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}</h2>
              <button className="btn btn-sm btn-outline" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Project *</label>
                  <select
                    className="form-select"
                    value={formData.projectId}
                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                    required
                  >
                    <option value="">Select a project</option>
                    {projects && projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title} ({project.client_name})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-textarea"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Payment terms, additional details, etc."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingInvoice ? 'Update' : 'Create'} Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Record Payment</h2>
              <button className="btn btn-sm btn-outline" onClick={() => setShowPaymentModal(false)}>✕</button>
            </div>

            <form onSubmit={handlePaymentSubmit}>
              <div className="modal-body">
                <div className="payment-info">
                  <div className="info-row">
                    <span>Invoice:</span>
                    <strong>{selectedInvoice.invoice_number}</strong>
                  </div>
                  <div className="info-row">
                    <span>Total Amount:</span>
                    <strong>{formatCurrency(selectedInvoice.total_amount)}</strong>
                  </div>
                  <div className="info-row">
                    <span>Already Paid:</span>
                    <strong>{formatCurrency(selectedInvoice.paid_amount)}</strong>
                  </div>
                  <div className="info-row highlight">
                    <span>Remaining:</span>
                    <strong>{formatCurrency((selectedInvoice.total_amount || 0) - (selectedInvoice.paid_amount || 0))}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Amount *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    min="0.01"
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={paymentData.payment_date}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Method *</label>
                  <select
                    className="form-select"
                    value={paymentData.payment_method}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-textarea"
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                    placeholder="Transaction ID, check number, etc."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
