import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { expensesAPI } from '../services/api';
import { format } from 'date-fns';
import { useExpenses } from '../hooks/useExpenses';
import { useProjects } from '../hooks/useProjects';
import DataTable from '../components/DataTable';
import ErrorBoundary from '../components/ErrorBoundary';
import FocusLock from 'react-focus-lock';
import './Expenses.css';

const Expenses = () => {
  const [statusFilter, setStatusFilter] = useState('all');

  // Use SWR hooks for data fetching with caching
  // Fixed: Backend uses clientApproved (boolean), not approval_status (string)
  const filterParams = statusFilter === 'approved'
    ? { clientApproved: true }
    : statusFilter === 'pending'
    ? { clientApproved: false }
    : {};
  const { expenses, isLoading: expensesLoading, mutate: mutateExpenses} = useExpenses(filterParams);
  const { projects, isLoading: projectsLoading } = useProjects();

  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedExpenses, setSelectedExpenses] = useState([]);
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
        toast.success('Expense updated successfully');
      } else {
        const response = await expensesAPI.create(formData);
        // Fixed: Backend returns flat response, not nested
        expenseId = response.data.id;
        toast.success('Expense created successfully');
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
      const message = err.response?.data?.message || err.message || 'Failed to save expense';
      toast.error(message);
    }
  }, [editingExpense, formData, selectedFile, mutateExpenses]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        toast.error('Only JPG, PNG, and PDF files are allowed');
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const handleApprovalChange = useCallback(async (id, newStatus) => {
    try {
      // Fixed: Backend only has approve endpoint, not updateApprovalStatus
      if (newStatus === 'approved') {
        await expensesAPI.approve(id);
        toast.success('Expense approved successfully');
      } else {
        // For now, backend doesn't support rejection, so we just don't approve
        toast.warning('Backend currently only supports approval. Rejection not yet implemented.');
        return;
      }
      mutateExpenses();
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to update approval status';
      toast.error(message);
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
      toast.success('Expense deleted successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete expense';
      toast.error(message);
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
          // Fixed: Backend uses client_approved (boolean), not approval_status (string)
          .filter(exp => exp.client_approved === true)
          .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0)
      : 0;
  }, [expenses]);

  // Bulk delete selected expenses
  const handleBulkDelete = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete ${selectedExpenses.length} expense(s)?`)) return;

    try {
      await Promise.all(selectedExpenses.map(id => expensesAPI.delete(id)));
      setSelectedExpenses([]);
      mutateExpenses();
      toast.success(`${selectedExpenses.length} expense(s) deleted successfully`);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete some expenses';
      toast.error(message);
      mutateExpenses();
    }
  }, [selectedExpenses, mutateExpenses]);

  // Define table columns
  const columns = useMemo(() => [
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (expense) => expense.date ? format(new Date(expense.date), 'MMM d, yyyy') : '-',
    },
    {
      key: 'description',
      label: 'Description',
      sortable: true,
      render: (expense) => (
        <div>
          <div className="expense-description">{expense.description}</div>
          {expense.notes && <div className="expense-notes">{expense.notes}</div>}
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      render: (expense) => (
        <span className="category-badge">
          {getCategoryIcon(expense.category)} {expense.category}
        </span>
      ),
    },
    {
      key: 'client_name',
      label: 'Client',
      sortable: true,
      render: (expense) => expense.client_name || '-',
    },
    {
      key: 'project_title',
      label: 'Project',
      sortable: true,
      render: (expense) => expense.project_title || '-',
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (expense) => <span className="amount-cell">{formatCurrency(expense.amount)}</span>,
    },
    {
      key: 'receipt_url',
      label: 'Receipt',
      sortable: false,
      render: (expense) => expense.receipt_url ? (
        <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
          View
        </a>
      ) : (
        <span className="text-muted">No receipt</span>
      ),
    },
    {
      key: 'client_approved',
      label: 'Status',
      sortable: true,
      render: (expense) => (
        <select
          className={`status-select ${getStatusBadge(expense.client_approved ? 'approved' : 'pending')}`}
          value={expense.client_approved ? 'approved' : 'pending'}
          onChange={(e) => handleApprovalChange(expense.id, e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
        </select>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (expense) => (
        <div className="table-actions">
          <button className="btn btn-sm btn-outline" onClick={() => openEditModal(expense)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(expense.id)}>Delete</button>
        </div>
      ),
    },
  ], [getCategoryIcon, formatCurrency, getStatusBadge, handleApprovalChange, openEditModal, handleDelete]);

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
          {/* Removed rejected filter - backend doesn't support rejection yet */}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <ErrorBoundary>
            <DataTable
              data={expenses || []}
              columns={columns}
              loading={expensesLoading}
              onSelectionChange={setSelectedExpenses}
              selectable={true}
              searchPlaceholder="Search expenses by description, category, or client..."
              searchFields={['description', 'category', 'client_name', 'project_title', 'notes']}
              actions={
                <button
                  className="btn btn-sm btn-danger"
                  onClick={handleBulkDelete}
                >
                  Delete Selected
                </button>
              }
              emptyState={
                <div className="empty-state">
                  <div className="empty-icon">💳</div>
                  <h3>No expenses found</h3>
                  <p>Track your business expenses with receipts</p>
                  <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                    + Add Expense
                  </button>
                </div>
              }
            />
          </ErrorBoundary>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <FocusLock returnFocus>
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
          </FocusLock>
        </div>
      )}
    </div>
  );
};

export default Expenses;
