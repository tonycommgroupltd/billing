import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon, UserAvatar } from "../../components/Component";
import { findUpper } from "../../utils/Utils";
import { DropdownItem, UncontrolledDropdown, DropdownMenu, DropdownToggle } from "reactstrap";

const UserProfileAside = ({ updateSm, sm, user }) => {

    useEffect(() => {
        sm ? document.body.classList.add("toggle-shown") : document.body.classList.remove("toggle-shown");
    }, [sm])

    return (
        <div className="card-inner-group">
            <div className="card-inner">
                <div className="user-card">
                    <UserAvatar text={findUpper(user.name)} theme="primary" />
                    <div className="user-info">
                        <span className="lead-text">{user.name}</span>
                        <span className="sub-text">{user.email}</span>
                    </div>
                    <div className="user-action">
                        <UncontrolledDropdown>
                            <DropdownToggle tag="a" className="btn btn-icon btn-trigger me-n2">
                                <Icon name="more-v"></Icon>
                            </DropdownToggle>
                            <DropdownMenu end>
                                <ul className="link-list-opt no-bdr">
                                    <li>
                                        <DropdownItem
                                            tag="a"
                                            href="#dropdownitem"
                                            onClick={(ev) => {
                                                ev.preventDefault();
                                            }}
                                        >
                                            <Icon name="camera-fill"></Icon>
                                            <span>Change Photo</span>
                                        </DropdownItem>
                                    </li>
                                    <li>
                                        <DropdownItem
                                            tag="a"
                                            href="#dropdownitem"
                                            onClick={(ev) => {
                                                ev.preventDefault();
                                            }}
                                        >
                                            <Icon name="edit-fill"></Icon>
                                            <span>Update Profile</span>
                                        </DropdownItem>
                                    </li>
                                </ul>
                            </DropdownMenu>
                        </UncontrolledDropdown>
                    </div>
                </div>
            </div>
            <div className="card-inner p-0">
                <ul className="link-list-menu">
                    <li onClick={() => updateSm(false)}>
                        <Link
                            to={`${process.env.PUBLIC_URL}/profile`}
                            className={
                                window.location.pathname === `${process.env.PUBLIC_URL}/profile` ? "active" : ""
                            }
                        >
                            <Icon name="user-fill-c"></Icon>
                            <span>Personal Information</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default UserProfileAside;
