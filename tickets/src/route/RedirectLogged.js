import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { connect } from 'react-redux';

const RedirectLogged = ({ isLoggedIn }) => {

    return (
        isLoggedIn ? (
            <Navigate to="/" replace />
        ) : (
            <Outlet />
        )
    );
};
const mapStateToProps = (state) => ({
    isLoggedIn: state.auth.isLoggedIn
});

export default connect(mapStateToProps)(RedirectLogged);