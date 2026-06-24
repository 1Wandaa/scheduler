import React from 'react';

// Helper function to render colored badges based on role
const renderRoleBadge = (role) => {
    let badgeStyle = {
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: '600',
      display: 'inline-block'
    };

    if (role === 'Admin') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--danger)', color: 'white' };
    } else if (role === 'Department Head') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--accent-primary)', color: 'white' };
    } else if (role === 'Faculty') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' };
    } else {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' };
    }

    return <span style={badgeStyle}>{role}</span>;
};

const UserTable = ({ users, onDeleteUser }) => {
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
                                <td style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{u.username}</td>
                                <td style={{ fontWeight: '500' }}>{u.name}</td>
                                <td>{renderRoleBadge(u.role)}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                    <button className="btn-delete" onClick={() => onDeleteUser(u.id)}>Delete</button>
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
