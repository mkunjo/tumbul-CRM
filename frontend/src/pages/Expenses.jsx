import { useState, useCallback } from 'react';
import { expensesAPI } from '../services/api';
import { format } from 'date-fns';
import { useExpenses } from '../hooks/useExpenses';
import { useProjects } from '../hooks/useProjects';
import './Expenses.css';

const Expenses = () => {
  const [statusFilter, setStatusFilter] = useState('all');

  // Use SWR hooks for data fetching with caching
  const filterParams = statusFilter !== 'all' ? { approval_status: statusFilter } : {};
  const { expenses, isLoading: expensesLoading, mutate: mutateExpenses } = useExpenses(filterParams);
  const { projects, isLoading: projectsLoading } = useProjects();

  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [formData, setFormData] = useState({
    projectId: '',
    category: 'materials',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    notes: '',
  });

  const loading = expensesLoading || projectsLoading;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      let expenseId;

      if (editingExpense) {
        await expensesAPI.update(editingExpense.id, formData);
        expenseId = editingExpense.id;
      } else {
        const response = await expensesAPI.create(formData);
        expenseId = response.data.expense.id;
      }

      // Upload receipt if file is selected
      if (selectedFile) {
        const receiptFormData = new FormData();
        receiptFormData.append('receipt', selectedFile);
        await expensesAPI.uploadReceipt(expenseId, receiptFormData);
      }

      setShowModal(false);
      resetForm();
      mutateExpenses();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save expense');
    }
  }, [editingExpense, formData, selectedFile, mutateExpenses]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        alert('Only JPG, PNG, and PDF files are allowed');
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const handleApprovalChange = useCallback(async (id, status) => {
    try {
      await expensesAPI.updateApprovalStatus(id, status);
      mutateExpenses();
    } catch (err) {
      alert('Failed to update approval status');
    }
  }, [mutateExpenses]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      // Optimistic update
      mutateExpenses(
        expenses.filter((exp) => exp.id !== id),
        false
      );
      await expensesAPI.delete(id);
      mutateExpenses();
    } catch (err) {
      alert('Failed to delete expense');
      mutateExpenses();
    }
  }, [expenses, mutateExpenses]);

  const openEditModal = useCallback((expense) => {
    setEditingExpense(expense);
    setFormData({
      projectId: expense.project_id || '',
      category: expense.category,
      amount: expense.amount,
      date: expense.date ? expense.date.split('T')[0] : '',
      description: expense.description,
      notes: expense.notes || '',
    });
    setShowModal(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      projectId: '',
      category: 'materials',
      amount: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      notes: '',
    });
    setEditingExpense(null);
    setSelectedFile(null);
  }, []);

  const getStatusBadge = useCallback((status) => {
    const badges = {
      pending: 'warning',
      approved: 'success',
      rejected: 'danger',
    };
    return `badge badge-${badges[status] || 'secondary'}`;
  }, []);

  const getCategoryIcon = useCallback((category) => {
    const icons = {
      materials: '🔨',
      labor: '👷',
      equipment: '⚙️',
      transportation: '🚗',
      supplies: '📦',
      other: '📌',
    };
    return icons[category] || '📌';
  }, []);

  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  }, []);

  const getTotalExpenses = useCallback(() => {
    return expenses ? expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0) : 0;
  }, [expenses]);

  const getApprovedExpenses = useCallback(() => {
    return expenses
      ? expenses
          .filter(exp => exp.approval_status === 'approved')
          .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0)
      : 0;
  }, [expenses]);

  if (loading && !expenses && !projects) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="expenses-page">
      <div className="page-header">
        <div>
          <h1>Expenses</h1>
          <div className="expense-summary">
            <span className="summary-item">
              Total: <strong>{formatCurrency(getTotalExpenses())}</strong>
            </span>
            <span className="summary-item">
              Approved: <strong>{formatCurrency(getApprovedExpenses())}</strong>
            </span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + Add Expense
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
            className={`filter-tab ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            Pending
          </button>
          <button
            className={`filter-tab ${statusFilter === 'approved' ? 'active' : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            Approved
          </button>
          <button
            className={`filter-tab ${statusFilter === 'rejected' ? 'active' : ''}`}
            onClick={() => setStatusFilter('rejected')}
          >
            Rejected
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {expenses && expenses.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.expense_date ? format(new Date(expense.expense_date), 'MMM d, yyyy') : '-'}</td>
                    <td>
                      <div className="expense-description">{expense.description}</div>
                      {expense.notes && (
                        <div className="expense-notes">{expense.notes}</div>
                      )}
                    </td>
                    <td>
                      <span className="category-badge">
                        {getCategoryIcon(expense.category)} {expense.category}
                      </span>
                    </td>
                    <td>{expense.client_name || '-'}</td>
                    <td>{expense.project_name || '-'}</td>
                    <td className="amount-cell">{formatCurrency(expense.amount)}</td>
                    <td>
                      {expense.receipt_url ? (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-muted">No receipt</span>
                      )}
                    </td>
                    <td>
                      <select
                        className={`status-select ${getStatusBadge(expense.approval_status)}`}
                        value={expense.approval_status}
                        onChange={(e) => handleApprovalChange(expense.id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openEditModal(expense)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(expense.id)}
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
              <div className="empty-icon">💳</div>
              <h3>No expenses found</h3>
              <p>Track your business expenses with receipts</p>
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                + Add Expense
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingExpense ? 'Edit Expense' : 'Add New Expense'}</h2>
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

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <select
                      className="form-select"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    >
                      <option value="materials">Materials</option>
                      <option value="labor">Labor</option>
                      <option value="equipment">Equipment</option>
                      <option value="transportation">Transportation</option>
                      <option value="supplies">Supplies</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Amount *</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Expense Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                    placeholder="What was this expense for?"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-textarea"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional details..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Receipt (optional)</label>
                  <div className="file-upload-wrapper">
                    <input
                      type="file"
                      id="receipt-upload"
                      className="file-input"
                      onChange={handleFileChange}
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                    />
                    <label htmlFor="receipt-upload" className="file-label">
                      <span className="file-icon">📎</span>
                      {selectedFile ? selectedFile.name : 'Choose file (JPG, PNG, PDF - Max 5MB)'}
                    </label>
                  </div>
                  {editingExpense?.receipt_url && !selectedFile && (
                    <div className="current-receipt">
                      Current receipt: <a href={editingExpense.receipt_url} target="_blank" rel="noopener noreferrer">View</a>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingExpense ? 'Update' : 'Add'} Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
