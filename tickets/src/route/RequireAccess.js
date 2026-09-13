import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { connect } from 'react-redux';

import Error403Modern from "../pages/error/403-modern";

const RequireAccess = ({ allowedRoles, user }) => {
    const all_roles = (user?.all_roles || []).map((role) => (role || '').toString().toLowerCase());
    const normalizedAllowedRoles = (allowedRoles || []).map((role) => (role || '').toString().toLowerCase());

    return (
        all_roles.length > 0 && all_roles.some(role => normalizedAllowedRoles.includes(role))
            ? <Outlet />
            : <Error403Modern />
    );
};
const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(RequireAccess);