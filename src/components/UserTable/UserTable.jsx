import React from 'react';

// Helper function to render colored badges based on role
const renderRoleBadge = (role) => {
    let badgeStyle = {
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px',
      borderRadius: '16px',
      fontSize: '0.75rem',
      fontWeight: '700',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
    };
    let icon = null;

    if (role === 'Admin') {
      badgeStyle = { ...badgeStyle, background: 'linear-gradient(135deg, #FEE2E2, #FECACA)', color: '#b91c1c', border: '1px solid #fca5a5' };
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>;
    } else if (role === 'Department Head') {
      badgeStyle = { ...badgeStyle, background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)', color: '#4338ca', border: '1px solid #c7d2fe' };
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>;
    } else if (role === 'Faculty') {
      badgeStyle = { ...badgeStyle, background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', color: '#b45309', border: '1px solid #fcd34d' };
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>;
    } else {
      badgeStyle = { ...badgeStyle, background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', color: '#15803d', border: '1px solid #bbf7d0' };
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    }

    return <span style={badgeStyle}>{icon}{role}</span>;
};

const UserTable = ({ users, onDeleteUser, onEditUser }) => {
    return (
        <div className="table-responsive">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Full Name</th>
                        <th>Role</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.length === 0 ? (
                        <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users found.</td>
                        </tr>
                    ) : (
                        users.map(u => (
                            <tr key={u.id}>
                                <td>
                                    <span style={{ color: 'var(--accent-primary)', fontWeight: '600', fontSize: '0.85rem', letterSpacing: '0.3px' }}>
                                        {u.username}
                                    </span>
                                </td>
                                <td><strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{u.name}</strong></td>
                                <td>{renderRoleBadge(u.role)}</td>
                                <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: '8px' }}>
                                    <button onClick={() => onEditUser(u)} className="btn-icon" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px' }} title="Edit">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button onClick={() => onDeleteUser(u.id)} className="btn-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px' }} title="Delete">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default UserTable;
