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

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown Date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(timestamp));
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
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
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
                    <th>Type</th>
                    <th>Item Details</th>
                    <th>Deleted At</th>
                    <th>Cascaded Impact</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trashItems.map(item => {
                    const isSelected = selectionMode && selectedIds.includes(item.id);
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
                    <td data-label="Type">
                      <span style={{ 
                        background: `${getTypeColor(item.type)}20`, 
                        color: getTypeColor(item.type), 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {item.type}
                      </span>
                    </td>
                    <td data-label="Item Details">
                      <div className="td-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                          {item.data.name || item.data.code || item.originalId}
                        </div>
                        {item.data && Object.keys(item.data).length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {Object.entries(item.data)
                            .filter(([key, value]) => !['name', 'code', 'id', 'createdAt', 'updatedAt'].includes(key) && value !== null && value !== undefined && typeof value !== 'object')
                            .map(([key, value]) => (
                              <span key={key}>
                                <span style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>: {String(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="Deleted At">
                      <div className="td-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {formatDate(item.deletedAt)}
                      </div>
                    </td>
                    <td data-label="Cascaded Impact">
                      <div className="td-content" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end' }}>
                        {item.cascadedSchedules?.length > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: '500' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            {item.cascadedSchedules.length} Schedule(s)
                          </span>
                        ) : 'None'}
                      </div>
                    </td>
                    <td data-label="Actions">
                      <div className="action-buttons-container" style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-sm" 
                          onClick={() => handleRestore(item)}
                          style={{ background: 'var(--success)', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                          title="Restore"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                          Restore
                        </button>
                        <button 
                          className="btn-icon btn-delete" 
                          onClick={() => handlePermanentDelete(item)}
                          title="Permanently Delete"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
