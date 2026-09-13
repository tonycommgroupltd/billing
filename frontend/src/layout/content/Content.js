import React from "react";
import SplynxBreadcrumbs from "../breadcrumb/SplynxBreadcrumbs";

/**
 * Page chrome. Splynx-style breadcrumbs show by default.
 * Opt out with `hideBreadcrumb`. Optional `breadcrumb` override for title/icon/items.
 */
const Content = ({ hideBreadcrumb, showBreadcrumb, breadcrumb, ...props }) => {
  // Legacy: showBreadcrumb={false} still hides; otherwise default on
  const showCrumbs =
    hideBreadcrumb === true || showBreadcrumb === false ? false : true;

  return (
    <div className="nk-content">
      <div className="container-fluid">
        <div className="nk-content-inner">
          <div className="nk-content-body">
            {showCrumbs ? <SplynxBreadcrumbs hide={false} override={breadcrumb} /> : null}
            {!props.page ? props.children : null}
            {props.page === "component" ? (
              <div className="components-preview wide-md mx-auto">{props.children}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Content;
