import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { connect } from 'react-redux';

const RequireResetPassword = ({ user }) => {
    const reset = user && user.reset_password
    const token = user && user.reset_token

    return (
        reset ? <Outlet /> : <Navigate to={`auth/password/recovery/${token}`} replace />
    );
};
const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(RequireResetPassword);