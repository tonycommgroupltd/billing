import React, { useState } from "react";
import { useNavigate, useLocation } from 'react-router-dom'
import UserAvatar from "../../../../components/user/UserAvatar";
import { DropdownToggle, DropdownMenu, Dropdown } from "reactstrap";
import { Icon } from "../../../../components/Component";
import { LinkList, LinkItem } from "../../../../components/links/Links";
import { connect } from 'react-redux';
import ActionTypes from '../../../../store/action-types';

const User = ({ user, onUserLogout }) => {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((prevState) => !prevState);
  const location = useLocation();

  const navigate = useNavigate();

  const logOut = () => {
    onUserLogout();
    //navigate('/login', { state: { from: location } });
    navigate('/login');
  }

  return (
    <Dropdown isOpen={open} className="user-dropdown" toggle={toggle}>
      <DropdownToggle
        tag="a"
        href="#toggle"
        className="dropdown-toggle"
        onClick={(ev) => {
          ev.preventDefault();
        }}
      >
        <div className="user-toggle">
          <UserAvatar icon="user-alt" className="sm" />
          <div className="user-info d-none d-md-block">
            <div className="user-status">{user.role_display_name}</div>
            <div className="user-name dropdown-indicator">{user.name}</div>
          </div>
        </div>
      </DropdownToggle>
      <DropdownMenu end className="dropdown-menu-md dropdown-menu-s1">
        <div className="dropdown-inner user-card-wrap bg-lighter d-none d-md-block">
          <div className="user-card sm">
            <UserAvatar icon="user-alt" className="sm" />
            <div className="user-info">
              <span className="lead-text">{user.name}</span>
              <span className="sub-text">{user.email}</span>
            </div>
          </div>
        </div>
        <div className="dropdown-inner">
          <LinkList>
            <LinkItem link="/profile" icon="user-alt" onClick={toggle}>
              View Profile
            </LinkItem>
            {/*<LinkItem link="#" icon="setting-alt" onClick={toggle}>
              Account Setting
            </LinkItem>
            <LinkItem link="#" icon="activity-alt" onClick={toggle}>
              Login Activity
            </LinkItem>*/}
          </LinkList>
        </div>
        <div className="dropdown-inner">
          <LinkList>
            <a
              href="#logout"
              onClick={(ev) => {
                ev.preventDefault();
                logOut();
              }}>
              <Icon name="signout"></Icon>
              <span>Sign Out</span>
            </a>
          </LinkList>
        </div>
      </DropdownMenu>
    </Dropdown>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser
});

const mapDispatchToProps = (dispatch) => ({
  onUserLogout: () => dispatch({ type: ActionTypes.LOGOUT_USER })
});
export default connect(mapStateToProps, mapDispatchToProps)(User);
