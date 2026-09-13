import React, { useEffect, useState, useLayoutEffect } from "react";
import Sidebar from "./sidebar/Sidebar";
import Head from "./head/Head";
import Header from "./header/Header";
import Footer from "./footer/Footer";
import classNames from "classnames";
import { Outlet, useLocation } from "react-router-dom";
import { BreadcrumbProvider } from "./breadcrumb/BreadcrumbContext";
import { NotificationRefreshProvider } from "./notification/NotificationRefreshProvider";
import { ensureTicketsAuth } from "../helpers/ticketsAuth";
import { recoverToProductionIfHealthy } from "../helpers/apiBase";

const Layout = ({title, ...props}) => {
  const location = useLocation();
  //Sidebar
  const [mobileView, setMobileView] = useState();
  const [visibility, setVisibility] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [themeState] = useState({
    main: "default",
    sidebar: "light",
    header: "white",
    skin: "light",
  });

  useEffect(() => {
    viewChange();
    window.addEventListener("resize", viewChange);
    if (localStorage.getItem('token') && process.env.REACT_APP_SKIP_TICKETS_AUTH_SYNC !== 'true') {
      ensureTicketsAuth().catch(() => {});
    }
    // If Auto mode sticky-failed to standby, probe Contabo and recover when healthy.
    recoverToProductionIfHealthy().catch(() => {});
    return () => {
      window.removeEventListener("resize", viewChange);
    };
  }, []);

  // Stops scrolling on overlay
  useLayoutEffect(() => {
    if (visibility) {
      document.body.style.overflow = "hidden";
      document.body.style.height = "100%";
    }
    if (!visibility) {
      document.body.style.overflow = "auto";
      document.body.style.height = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
      document.body.style.height = "auto";
    };
  }, [visibility]);

  // Toggle drawer only — never preventDefault here.
  // Menu NavLinks call this on mobile; preventDefault would block navigation.
  const toggleSidebar = () => {
    setVisibility((current) => !current);
  };

  useEffect(() => {
    if (mobileView) setVisibility(false);
  }, [location.pathname, mobileView]);

  useEffect(() => {
    document.body.className = `nk-body bg-lighter npc-default has-sidebar no-touch nk-nio-theme ${themeState.skin === "dark" ? "dark-mode" : ""
      }`;
  }, [themeState.skin]);

  const viewChange = () => {
    if (window.innerWidth < 1200) {
      setMobileView(true);
    } else {
      setMobileView(false);
      setVisibility(false);
    }
  };

  const sidebarClass = classNames({
    "nk-sidebar-mobile": mobileView,
    "nk-sidebar-active": visibility && mobileView,
  });

  return (
    <React.Fragment>
      <Head title={!title && 'Loading'} />
      <div className="nk-app-root">
        <div className="nk-main splynx-shell">
          <NotificationRefreshProvider>
            <Header
              className="splynx-header-bar"
              sidebarToggle={toggleSidebar}
              sidebarCompact={sidebarCompact}
              onSidebarCompact={() => setSidebarCompact((value) => !value)}
              setVisibility={setVisibility}
              fixed
              theme={themeState.header}
            />
            <div className="splynx-main-row">
              <Sidebar
                sidebarToggle={toggleSidebar}
                fixed
                isCompact={sidebarCompact}
                mobileView={mobileView}
                theme={themeState.sidebar}
                className={sidebarClass}
              />
              {visibility && mobileView && (
                <div className="nk-sidebar-overlay splynx-sidebar-overlay" onClick={toggleSidebar} />
              )}
              <div className="nk-wrap splynx-content-wrap">
                <div className="nk-wrap-body">
                  <BreadcrumbProvider>
                    <Outlet />
                  </BreadcrumbProvider>
                </div>
              </div>
            </div>
          </NotificationRefreshProvider>
          <Footer />
        </div>
      </div>
    </React.Fragment>
  );
};
export default Layout;
