import React from 'react';
import { useLocation, Navigate, Outlet } from 'react-router-dom';
import { connect } from 'react-redux';

const RequireAuth = ({ isLoggedIn }) => {
    const location = useLocation();
    
    return (
        isLoggedIn ? (
            <Outlet />
        ) : (
            //<Navigate to="/login" state={{ from: location }} replace />
            <Navigate to="/login" replace />
        )
    );
};
const mapStateToProps = (state) => ({
    isLoggedIn: state.auth.isLoggedIn
});

export default connect(mapStateToProps)(RequireAuth);