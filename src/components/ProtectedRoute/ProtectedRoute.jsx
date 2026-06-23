import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ user, allowedRoles, children }) => {
    // 1. If user is not logged in at all, kick them to login
    if (!user) {
        return <Navigate to="/" replace />;
    }

    // 2. If the route requires specific roles, check if the user has one of them
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // If they are a student trying to access admin, kick them to their dashboard
        return <Navigate to="/dashboard" replace />;
    }

    // 3. User is authorized, render the page
    return children;
};

export default ProtectedRoute;