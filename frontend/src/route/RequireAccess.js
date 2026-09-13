import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { connect } from 'react-redux';

import Error403Modern from "../pages/error/403-modern";

const RequireAccess = ({ allowedRoles, user }) => {
    const all_roles = user && user.all_roles

    return (
        all_roles && all_roles.some(role => allowedRoles.includes(role))
            ? <Outlet />
            : <Error403Modern />
    );
};
const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(RequireAccess);