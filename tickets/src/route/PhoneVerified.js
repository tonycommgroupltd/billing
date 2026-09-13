import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { connect } from 'react-redux';

const PhoneVerified = ({ user }) => {
    const verified = user && user.has_verified

    return (
        verified ? <Outlet /> : <Navigate to="/auth/otp/verify" replace />
    );
};
const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(PhoneVerified);