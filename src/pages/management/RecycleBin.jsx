import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { restoreFromTrash } from '../../services/restoreService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import BatchActionBar from '../../components/common/BatchActionBar';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import './RecycleBin.css';

const RecycleBin = ({ onBack, user }) => {
  const { confirm } = useGlobalDialog();
  const [trashItems, setTrashItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'trash'), (snap) => {
      setTrashItems(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.deletedAt - a.deletedAt));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const allSelected = trashItems.length > 0 && trashItems.every(item => selectedIds.includes(item.id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(trashItems.map(item => item.id));
    }
  };

  const handleRestore = async (item) => {
    try {
      await restoreFromTrash(item);
      setSelectedIds(prev => prev.filter(id => id !== item.id));
      const itemName = item.data?.name || item.data?.code || item.data?.username || item.originalId;
      logActivity({ user, action: LOG_ACTIONS.RESTORE_DATA, details: `Restored ${item.type}: ${itemName}` });
      toast.success(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} restored successfully!`);
    } catch (err) {
      console.error("Error restoring item:", err);
      toast.error('Failed to restore item.');
    }
  };

  const handleRestoreSelected = async () => {
    const selectedItems = trashItems.filter(item => selectedIds.includes(item.id));
    if (selectedItems.length === 0) return;
    const count = selectedItems.length;

    const isConfirmed = await confirm({
      title: `Restore ${count} Item${count > 1 ? 's' : ''}?`,
      text: `Are you sure you want to restore ${count} selected item${count > 1 ? 's' : ''}?`,
      icon: 'info',
      confirmButtonText: `Restore ${count} Selected`,
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Restoring ${count} items...`);
      try {
        for (const item of selectedItems) {
          await restoreFromTrash(item);
        }
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_RESTORE_DATA,
          details: `Batch restored ${count} items from trash`
        });
        toast.success(`Successfully restored ${count} item${count > 1 ? 's' : ''}`, { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error restoring items:", err);
        toast.error('Failed to restore some items.', { id: toastId });
      }
    }
  };

  const handlePermanentDelete = async (item) => {
    const isConfirmed = await confirm({
      title: 'Permanently Delete?',
      text: "This action cannot be undone. Are you sure you want to permanently delete this item?",
      icon: 'warning',
      confirmButtonText: 'Delete Forever',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        await deleteDoc(doc(db, 'trash', String(item.id)));
        setSelectedIds(prev => prev.filter(id => id !== item.id));
        const itemName = item.data?.name || item.data?.code || item.data?.username || item.originalId;
        logActivity({ user, action: LOG_ACTIONS.PERMANENT_DELETE, details: `Permanently deleted ${item.type}: ${itemName}` });
        toast.success('Item permanently deleted.');
      } catch (err) {
        console.error("Error deleting item:", err);
        toast.error('Failed to delete item permanently.');
      }
    }
  };

  const handlePermanentDeleteSelected = async () => {
    const selectedItems = trashItems.filter(item => selectedIds.includes(item.id));
    if (selectedItems.length === 0) return;
    const count = selectedItems.length;

    const isConfirmed = await confirm({
      title: `Permanently Delete ${count} Item${count > 1 ? 's' : ''}?`,
      text: `This action cannot be undone. Are you sure you want to permanently delete ${count} item${count > 1 ? 's' : ''}?`,
      icon: 'warning',
      confirmButtonText: 'Delete Forever',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Permanently deleting ${count} items...`);
      try {
        const batch = writeBatch(db);
        selectedItems.forEach(item => {
          batch.delete(doc(db, 'trash', String(item.id)));
        });
        await batch.commit();
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_PERMANENT_DELETE,
          details: `Permanently deleted ${count} items from trash`
        });
        toast.success(`Permanently deleted ${count} item${count > 1 ? 's' : ''}`, { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error deleting items:", err);
        toast.error('Failed to delete items permanently.', { id: toastId });
      }
    }
  };

  const handleEmptyTrash = async () => {
    const count = trashItems.length;
    if (count === 0) return;

    const isConfirmed = await confirm({
      title: 'Empty Recycle Bin?',
      text: `This action cannot be undone. Are you sure you want to permanently delete all ${count} items in the Recycle Bin?`,
      icon: 'warning',
      confirmButtonText: 'Empty Trash Forever',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading('Emptying Recycle Bin...');
      try {
        const batch = writeBatch(db);
        trashItems.forEach(item => {
          batch.delete(doc(db, 'trash', String(item.id)));
        });
        await batch.commit();
        logActivity({
          user,
          action: LOG_ACTIONS.EMPTY_RECYCLE_BIN,
          details: `Emptied Recycle Bin (${count} items)`
        });
        toast.success('Recycle Bin emptied.', { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error emptying trash:", err);
        toast.error('Failed to empty Recycle Bin.', { id: toastId });
      }
    }
  };

  const formatDeletedAt = (timestamp) => {
    if (!timestamp) return { date: 'Unknown', time: '' };
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return { date: 'Unknown', time: '' };
    const date = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(d);
    const time = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(d);
    return { date, time };
  };

  const getItemDetails = (item) => {
    const data = item.data || {};
    let title = data.name || data.code || data.username || data.title || item.originalId || 'Untitled Item';
    if (data.code && data.title && data.code !== data.title) {
      title = `${data.code} — ${data.title}`;
    } else if (data.code && data.name && data.code !== data.name) {
      title = `${data.code} — ${data.name}`;
    }

    const ignoredKeys = new Set([
      'name', 'code', 'title', 'id', 'createdAt', 'updatedAt', 
      'deletedAt', 'originalId', 'firstName', 'lastName', 
      'searchKeywords', 'normalizedName'
    ]);

    const details = [];

    if (data.program) details.push({ label: 'Program', value: data.program });
    if (data.yearLevel) {
      const yr = Number(data.yearLevel);
      details.push({ 
        label: 'Year Level', 
        value: yr ? `${yr}${yr === 1 ? 'st' : yr === 2 ? 'nd' : yr === 3 ? 'rd' : 'th'} Year` : String(data.yearLevel) 
      });
    }
    if (data.department) details.push({ label: 'Department', value: data.department });
    if (data.building) details.push({ label: 'Building', value: data.building });
    if (data.type && item.type === 'room') details.push({ label: 'Type', value: data.type });
    if (data.capacity) details.push({ label: 'Capacity', value: data.capacity });
    if (data.units !== undefined) details.push({ label: 'Units', value: data.units });
    if (data.maxUnits !== undefined) details.push({ label: 'Max Units', value: data.maxUnits });
    if (data.employmentType) details.push({ label: 'Employment', value: data.employmentType });
    if (data.role) details.push({ label: 'Role', value: data.role });
    if (data.email) details.push({ label: 'Email', value: data.email });

    const handledKeys = new Set([
      'program', 'yearLevel', 'department', 'building', 'type', 
      'capacity', 'units', 'maxUnits', 'employmentType', 'role', 'email'
    ]);

    Object.entries(data).forEach(([key, value]) => {
      if (ignoredKeys.has(key) || handledKeys.has(key)) return;
      if (value === null || value === undefined || typeof value === 'object') return;
      const strVal = String(value).trim();
      if (!strVal) return;
      const formattedLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
      details.push({ label: formattedLabel, value: strVal });
    });

    return { title, details };
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'faculty': return '#3b82f6';
      case 'subject': return '#10b981';
      case 'room': return '#f59e0b';
      case 'section': return '#8b5cf6';
      case 'user': return '#ec4899';
      default: return '#6b7280';
    }
  };

  return (
    <div className="card" style={{  position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 120px)' }}>
      <div className="mgmt-header" style={{ flexShrink: 0 }}>
        <div className="mgmt-header-left">
          {onBack && (
            <button className="back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back
            </button>
          )}
          <div className="mgmt-header-info">
            <h3 className="card-title">
              <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              Recycle Bin
            </h3>
            <p>Restore or permanently delete removed items</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {trashItems.length > 0 && (
            <button
              className={`select-mode-btn${selectionMode ? ' active' : ''}`}
              onClick={() => { if (selectionMode) { setSelectionMode(false); setSelectedIds([]); } else { setSelectionMode(true); } }}
              title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
        {loading ? (
          <div className="content-loading">
            <div className="content-loading-spinner"></div>
            <div className="content-loading-text">Loading items...</div>
          </div>
        ) : trashItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px', opacity: 0.5 }}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <h4 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: 'var(--text-main)' }}>Recycle Bin is empty</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: '300px' }}>Deleted items will appear here and can be restored at any time.</p>
          </div>
        ) : (
          <>
            {selectionMode && (
              <BatchActionBar
                selectedCount={selectedIds.length}
                totalCount={trashItems.length}
                itemName="trashed item"
                onSelectAll={handleToggleSelectAll}
                onDeselectAll={() => setSelectedIds([])}
                onDeleteSelected={handlePermanentDeleteSelected}
                onDeleteAll={handleEmptyTrash}
                onExitSelectionMode={() => { setSelectionMode(false); setSelectedIds([]); }}
                extraActions={selectedIds.length > 0 ? (
                  <button
                    type="button"
                    className="batch-btn batch-btn-success"
                    onClick={handleRestoreSelected}
                    title={`Restore ${selectedIds.length} items`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    <span>Restore Selected ({selectedIds.length})</span>
                  </button>
                ) : null}
              />
            )}

            <div className="table-responsive">
              <table className="data-table recycle-bin-table">
                <thead>
                  <tr>
                    {selectionMode && (
                      <th className="table-checkbox-col">
                        <input
                          type="checkbox"
                          className="data-checkbox"
                          checked={trashItems.length > 0 && trashItems.every(item => selectedIds.includes(item.id))}
                          onChange={handleToggleSelectAll}
                          title="Select/Deselect all"
                        />
                      </th>
                    )}
                    <th style={{ width: '120px' }}>Type</th>
                    <th>Item Details</th>
                    <th style={{ width: '170px' }}>Deleted At</th>
                    <th style={{ width: '160px' }}>Cascaded Impact</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trashItems.map(item => {
                    const isSelected = selectionMode && selectedIds.includes(item.id);
                    const { title, details } = getItemDetails(item);
                    const { date, time } = formatDeletedAt(item.deletedAt);
                    const typeColor = getTypeColor(item.type);

                    return (
                      <tr key={item.id} className={isSelected ? 'table-row-selected' : ''}>
                        {selectionMode && (
                          <td className="table-checkbox-col" data-label="Select">
                            <input
                              type="checkbox"
                              className="data-checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.id)}
                              aria-label={`Select ${item.type}`}
                            />
                          </td>
                        )}
                        <td data-label="Type" className="recycle-bin-type-col">
                          <span 
                            className="recycle-type-pill" 
                            style={{ 
                              background: `${typeColor}15`, 
                              color: typeColor, 
                              borderColor: `${typeColor}30` 
                            }}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td data-label="Item Details" className="recycle-bin-details-col">
                          <div className="item-details-content">
                            <div className="item-main-title">
                              {title}
                            </div>
                            {details.length > 0 && (
                              <div className="item-meta-chips">
                                {details.map((d, idx) => (
                                  <span key={idx} className="item-meta-chip">
                                    <span className="item-meta-label">{d.label}:</span>
                                    <span className="item-meta-val">{d.value}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td data-label="Deleted At" className="recycle-bin-date-col">
                          <div className="deleted-at-content">
                            <span className="deleted-date">{date}</span>
                            {time && <span className="deleted-time">{time}</span>}
                          </div>
                        </td>
                        <td data-label="Cascaded Impact" className="recycle-bin-impact-col">
                          <div className="impact-content">
                            {item.cascadedSchedules?.length > 0 ? (
                              <span className="impact-badge warning" title={`${item.cascadedSchedules.length} schedule(s) affected`}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                  <line x1="12" y1="9" x2="12" y2="13" />
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                {item.cascadedSchedules.length} Schedule{item.cascadedSchedules.length > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="impact-badge none">—</span>
                            )}
                          </div>
                        </td>
                        <td data-label="Actions" className="recycle-bin-actions-col">
                          <div className="action-buttons-container">
                            <button 
                              type="button"
                              className="btn btn-sm btn-restore-action" 
                              onClick={() => handleRestore(item)}
                              title="Restore"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                              <span>Restore</span>
                            </button>
                            <button 
                              type="button"
                              className="btn-icon btn-delete" 
                              onClick={() => handlePermanentDelete(item)}
                              title="Permanently Delete"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RecycleBin;
