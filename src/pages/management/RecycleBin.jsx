import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { restoreFromTrash } from '../../services/restoreService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const RecycleBin = ({ onBack, user }) => {
  const { confirm } = useGlobalDialog();
  const [trashItems, setTrashItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'trash'), (snap) => {
      setTrashItems(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.deletedAt - a.deletedAt));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleRestore = async (item) => {
    try {
      await restoreFromTrash(item);
      const itemName = item.data.name || item.data.code || item.originalId;
      logActivity({ user, action: 'RESTORE_DATA', details: `Restored ${item.type}: ${itemName}` });
      toast.success(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} restored successfully!`);
    } catch (err) {
      console.error("Error restoring item:", err);
      toast.error('Failed to restore item.');
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
        const itemName = item.data.name || item.data.code || item.originalId;
        logActivity({ user, action: 'PERMANENT_DELETE', details: `Permanently deleted ${item.type}: ${itemName}` });
        toast.success('Item permanently deleted.');
      } catch (err) {
        console.error("Error deleting item:", err);
        toast.error('Failed to delete item permanently.');
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
      default: return '#6b7280';
    }
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {onBack && (
            <button className="back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back
            </button>
          )}
          <div>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              Recycle Bin
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Restore or permanently delete removed items</p>
          </div>
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
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Item Details</th>
                  <th>Deleted At</th>
                  <th>Cascaded Impact</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashItems.map(item => (
                  <tr key={item.id}>
                    <td>
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
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                        {item.data.name || item.data.code || item.originalId}
                      </div>
                      {(item.data.department || item.data.capacity || item.data.credits) && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {item.data.department && `Dept: ${item.data.department}`}
                          {item.data.capacity && `Cap: ${item.data.capacity}`}
                          {item.data.credits && `Units: ${item.data.credits}`}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {formatDate(item.deletedAt)}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {item.cascadedSchedules?.length > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: '500' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            {item.cascadedSchedules.length} Schedule(s)
                          </span>
                        ) : 'None'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecycleBin;
