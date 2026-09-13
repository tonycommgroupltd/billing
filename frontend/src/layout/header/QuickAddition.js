import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Dropdown, DropdownToggle, DropdownMenu } from "reactstrap";
import Icon from "../../components/icon/Icon";

const QUICK_ITEMS = [
  { to: "/admin/customers/add", title: "Add customer", label: "Add customer" },
  { to: "/admin/leads/add", title: "Add lead", label: "Add lead" },
  { to: "/admin/tickets/create", title: "Add ticket", label: "Add ticket" },
  { to: "/admin/tariffs/internet--add", title: "Add internet tariff plan", label: "Add internet tariff plan" },
];

const QuickAddition = () => {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((prev) => !prev);

  return (
    <Dropdown
      isOpen={open}
      toggle={toggle}
      className="dropdown splynx-quick-addition"
      id="quick-addition"
      data-test-selector="quick-addition"
      title="Quick addition"
    >
      <DropdownToggle
        tag="a"
        href="#quick-add"
        className="dropdown-toggle nk-quick-nav-icon"
        onClick={(ev) => ev.preventDefault()}
        aria-label="Quick addition"
      >
        <Icon name="plus" />
      </DropdownToggle>
      <DropdownMenu end>
        {QUICK_ITEMS.map((item) => (
          <div key={item.to} className="dropdown-item">
            <Link
              to={`${process.env.PUBLIC_URL}${item.to}`}
              title={item.title}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          </div>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
};

export default QuickAddition;
