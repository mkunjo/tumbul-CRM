import { useState, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import './DataTable.css';

/**
 * Reusable DataTable component with multi-select, sorting, and search
 *
 * @param {Array} data - Array of data objects to display
 * @param {Array} columns - Column configuration: [{ key, label, sortable, render }]
 * @param {Function} onSelectionChange - Callback when selection changes
 * @param {Boolean} selectable - Enable row selection
 * @param {String} searchPlaceholder - Search input placeholder
 * @param {Array} searchFields - Fields to search in
 * @param {ReactNode} emptyState - Component to show when no data
 * @param {Boolean} loading - Show loading state while data is being fetched
 */
const DataTable = ({
  data = [],
  columns = [],
  onSelectionChange,
  selectable = true,
  searchPlaceholder = 'Search...',
  searchFields = [],
  emptyState,
  actions = null, // Bulk actions component
  virtualizeThreshold = 100, // Enable virtualization when rows exceed this number
  loading = false, // Loading state
}) => {
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState('');

  // Ref for virtualization
  const tableBodyRef = useRef(null);

  // Handle select all
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = new Set(filteredAndSortedData.map((row) => row.id));
      setSelectedRows(allIds);
      onSelectionChange?.(Array.from(allIds));
    } else {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    }
  };

  // Handle individual row selection
  const handleSelectRow = (id) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedRows(newSelection);
    onSelectionChange?.(Array.from(newSelection));
  };

  // Handle column sort
  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm || searchFields.length === 0) return data;

    const lowerSearchTerm = searchTerm.toLowerCase();
    return data.filter((row) => {
      return searchFields.some((field) => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], row);
        return value?.toString().toLowerCase().includes(lowerSearchTerm);
      });
    });
  }, [data, searchTerm, searchFields]);

  // Sort filtered data
  const filteredAndSortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    const sorted = [...filteredData].sort((a, b) => {
      const aValue = sortConfig.key.split('.').reduce((obj, key) => obj?.[key], a);
      const bValue = sortConfig.key.split('.').reduce((obj, key) => obj?.[key], b);

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortConfig]);

  // Clear selections that are no longer in filtered results
  useEffect(() => {
    const filteredIds = new Set(filteredAndSortedData.map(row => row.id));
    const stillValid = Array.from(selectedRows).filter(id => filteredIds.has(id));

    if (stillValid.length !== selectedRows.size) {
      const newSelection = new Set(stillValid);
      setSelectedRows(newSelection);
      onSelectionChange?.(Array.from(newSelection));
    }
  }, [searchTerm, sortConfig.key, sortConfig.direction, filteredAndSortedData, selectedRows, onSelectionChange]);

  // Check if all visible rows are selected
  const allSelected = filteredAndSortedData.length > 0 &&
    filteredAndSortedData.every((row) => selectedRows.has(row.id));
  const someSelected = filteredAndSortedData.some((row) => selectedRows.has(row.id));

  // Determine if we should use virtualization
  const shouldVirtualize = filteredAndSortedData.length > virtualizeThreshold;

  // Set up virtualizer for large datasets
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedData.length,
    getScrollElement: () => tableBodyRef.current,
    estimateSize: () => 50, // Estimated row height in pixels
    overscan: 10, // Number of items to render outside visible area
    enabled: shouldVirtualize,
  });

  // Helper to generate accessible label for row checkbox
  const getRowLabel = (row) => {
    // Try to find a descriptive field for the row
    const descriptors = ['name', 'title', 'description', 'invoice_number', 'client_name'];
    for (const field of descriptors) {
      if (row[field]) {
        return `Select ${row[field]}`;
      }
    }
    return `Select row`;
  };

  // Show loading state
  if (loading) {
    return (
      <div className="data-table-container">
        <div className="table-loading">
          <div className="spinner"></div>
          <p>Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="data-table-container">
      {/* Search and Bulk Actions Bar */}
      <div className="data-table-controls">
        <div className="search-box">
          <input
            type="text"
            className="form-input search-input"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search table"
            role="searchbox"
          />
          {searchTerm && (
            <button
              className="search-clear"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {selectedRows.size > 0 && actions && (
          <div className="bulk-actions">
            <span className="selected-count">
              {selectedRows.size} selected
            </span>
            {actions}
          </div>
        )}
      </div>

      {/* Search Results Info */}
      {searchTerm && (
        <div className="search-info" role="status" aria-live="polite">
          Showing {filteredAndSortedData.length} of {data.length} results
        </div>
      )}

      {/* Table */}
      {filteredAndSortedData.length > 0 ? (
        <div className="table-wrapper">
          <table className="table" role="table" aria-rowcount={filteredAndSortedData.length}>
            <thead>
              <tr>
                {selectable && (
                  <th className="checkbox-column">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = someSelected && !allSelected;
                        }
                      }}
                      onChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={column.sortable ? 'sortable' : ''}
                    onClick={() => column.sortable && handleSort(column.key)}
                    aria-sort={
                      column.sortable && sortConfig.key === column.key
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : column.sortable
                        ? 'none'
                        : undefined
                    }
                    role="columnheader"
                  >
                    <div className="th-content">
                      <span>{column.label}</span>
                      {column.sortable && (
                        <span className="sort-icon" aria-hidden="true">
                          {sortConfig.key === column.key ? (
                            sortConfig.direction === 'asc' ? '▲' : '▼'
                          ) : (
                            '⇅'
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              ref={tableBodyRef}
              style={
                shouldVirtualize
                  ? {
                      height: '600px',
                      overflow: 'auto',
                      position: 'relative',
                    }
                  : undefined
              }
            >
              {shouldVirtualize ? (
                <>
                  {/* Spacer for virtual scrolling */}
                  <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                    <td style={{ padding: 0, border: 0 }} />
                  </tr>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = filteredAndSortedData[virtualRow.index];
                    return (
                      <tr
                        key={row.id}
                        className={selectedRows.has(row.id) ? 'selected' : ''}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {selectable && (
                          <td className="checkbox-column">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.id)}
                              onChange={() => handleSelectRow(row.id)}
                              aria-label={getRowLabel(row)}
                            />
                          </td>
                        )}
                        {columns.map((column) => (
                          <td key={column.key}>
                            {column.render
                              ? column.render(row)
                              : column.key.split('.').reduce((obj, key) => obj?.[key], row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </>
              ) : (
                // Regular rendering for small datasets
                filteredAndSortedData.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedRows.has(row.id) ? 'selected' : ''}
                  >
                    {selectable && (
                      <td className="checkbox-column">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(row.id)}
                          onChange={() => handleSelectRow(row.id)}
                          aria-label={getRowLabel(row)}
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key}>
                        {column.render
                          ? column.render(row)
                          : column.key.split('.').reduce((obj, key) => obj?.[key], row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        emptyState || (
          <div className="empty-state">
            <p>No results found</p>
          </div>
        )
      )}
    </div>
  );
};

export default DataTable;
