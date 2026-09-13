import React, { useLayoutEffect } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { connect } from 'react-redux';

import RequireAuth from './RequireAuth';
import RequireAccess from './RequireAccess';

import { ROLES } from '../config/roles'

import LayoutNoSidebar from "../layout/Index-nosidebar";
import Layout from "../layout/Index";

import Homepage from "../pages/Homepage";
import CustHomepage from "../pages/customer/Homepage";

import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Register';
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import VerifyPhone from '../pages/auth/VerifyPhone';

import AddRouter from "../pages/networking/routers/Add";
import ListRouter from "../pages/networking/routers/List";
import ViewRouter from "../pages/networking/routers/View";
import BandwidthRouter from "../pages/networking/routers/Bandwidth";

// Fiber Structure
import NetworkMap from "../pages/networking/fiber/NetworkMap";
import NetworkMapQGIS from "../pages/networking/fiber/NetworkMapQGIS";
import NetworkMapQGISIframe from "../pages/networking/fiber/NetworkMapQGISIframe";
import FatList from "../pages/networking/fiber/FatList";
import ClosureList from "../pages/networking/fiber/ClosureList";
import InfrastructureList from "../pages/networking/fiber/InfrastructureList";
import ImportGeojsonAndMap from "../pages/networking/fiber/ImportGeojsonAndMap";

import FinanceDashboard from "../pages/finance/Dashboard";
import FinancePayments from "../pages/finance/payment/List";
import FinanceInvoices from "../pages/finance/invoice/List";
import FinanceMpesa from "../pages/finance/mpesa/List";
import ExpiredAccountsTracker from "../pages/finance/ExpiredAccountsTracker";
import MpesaTracker from "../pages/finance/MpesaTracker";
import NewCustomerTracker from "../pages/finance/NewCustomerTracker";
import ManualPayments from "../pages/finance/ManualPayments";
import FinancialReport from "../pages/finance/FinancialReport";
import BackupSync from "../pages/finance/BackupSync";
import KraOperations from "../pages/finance/KraOperations";
import KraAutoInvoicing from "../pages/finance/KraAutoInvoicing";
import KraReceiptPreview from "../pages/finance/KraReceiptPreview";
import KraInvoiceBrowser from "../pages/finance/KraInvoiceBrowser";

import AddCustomer from "../pages/customer/Add";
import OnlineCustomer from "../pages/customer/Online";
import ListCustomer from "../pages/customer/List";
import ViewCustomer from "../pages/customer/View";
import Credit from "../pages/customer/Credit";

import Services from "../pages/customer/Services";
import Invoices from "../pages/customer/Invoices";
import InvoiceDetails from "../pages/customer/InvoiceDetails";

import AddTariffInternet from "../pages/tariffs/internet/Add";
import ListTariffInternet from "../pages/tariffs/internet/List";
import EditTariffInternet from "../pages/tariffs/internet/Edit";

import InventoryDashboard from "../pages/inventory/Dashboard";
import InventoryList from "../pages/inventory/List";
import InventoryDisbursed from "../pages/inventory/Disbursed";
import InventoryAssignmentHistory from "../pages/inventory/AssignmentHistory";
import InventoryDiscardedCable from "../pages/inventory/DiscardedCable";
import InventoryMyItems from "../pages/inventory/MyInventory";
import InventoryItemLogs from "../pages/inventory/ItemLogs";
import InventoryCableUsage from "../pages/inventory/CableUsage";
import FleetLog from "../pages/fleet/FleetLog";
import FleetDashboard from "../pages/fleet/FleetDashboard";
import FleetCleaning from "../pages/fleet/FleetCleaning";
import FleetRoster from "../pages/fleet/FleetRoster";
import FleetCare from "../pages/fleet/FleetCare";

import TicketsDashboard from "../pages/tickets/Dashboard";
import TicketsList from "../pages/tickets/List";
import TicketView from "../pages/tickets/View";
import TicketCreate from "../pages/tickets/Create";
import DailySchedule from "../pages/tickets/DailySchedule";
import DailyRoster from "../pages/tickets/DailyRoster";
import ClosedTickets from "../pages/tickets/Closed";
import TicketsArchive from "../pages/tickets/Archive";
import CustomerCreatorAdd from "../pages/customerCreator/Add";
import CustomerCreatorList from "../pages/customerCreator/List";
import CustomerCreatorDashboard from "../pages/customerCreator/Dashboard";
import Installations from "../pages/tickets/Installations";
import ArchivedInstallations from "../pages/tickets/ArchivedInstallations";
import Routers from "../pages/tickets/Routers";
import TicketsReports from "../pages/tickets/Reports";
import LOSReport from "../pages/tickets/LOSReport";
import InstallationReport from "../pages/tickets/InstallationReport";
import ReportsManagement from "../pages/tickets/ReportsManagement";

// Bonus System — disabled
// import BonusDashboard from "../pages/admin/BonusDashboard";
// import BonusPaymentHistory from "../pages/admin/BonusPaymentHistory";
// import BonusSummary from "../pages/admin/BonusSummary";

// Hotspot System
import HotspotRedirect from "../pages/hotspot/HotspotRedirect";

// Splynx Data
import SplynxData from "../pages/admin/SplynxData";

// Expired Accounts Tracker
import ExpiredAccounts from "../pages/customer/ExpiredAccounts";

// Activity Logs
import ActivityLogsList from "../pages/admin/logs/List";
import ActiveUsers from "../pages/admin/logs/ActiveUsers";

import ViewAdministration from "../pages/administration/View";
import ListAdministrationAdministrators from "../pages/administration/administrators/List";
import ListAdministrationRoles from "../pages/administration/roles/List";

import Outbox from "../pages/sms/Outbox";
import ViewMessage from "../pages/sms/View";
import SMSDashboard from "../pages/sms/Dashboard";
import SendSingleSMS from "../pages/sms/SendSingle";
import SendGroupSMS from "../pages/sms/SendGroup";
import SendBulkSMS from "../pages/sms/SendBulk";
import SmsReports from "../pages/sms/Reports";

import OutboxWhatsapp from "../pages/whatsapp/Outbox";
import InboxWhatsapp from "../pages/whatsapp/Inbox";
import ViewWhatsappMessage from "../pages/whatsapp/View";

import Error404Modern from "../pages/error/404-modern";
import Payment from "../pages/customer/Payment";
import RedirectLogged from "./RedirectLogged";
import PhoneVerified from "./PhoneVerified";
import RequireResetPassword from "./RequireResetPassword";
import UserProfile from "../pages/user/UserProfile";
import InternetStats from "../pages/customer/InternetStats";

import Chat from "../pages/whatsapp/ChatContainer";


const Router = ({ user }) => {
    const location = useLocation();
    const normalizedRoles = (user?.all_roles || []).map((role) => (role || '').toString().toLowerCase());
    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, [location]);

    return (
        <Routes>
            <Route path="/" element={<RequireAuth />}>
                <Route path="auth/otp/verify" element={<VerifyPhone />}></Route>
                <Route path="auth/password/recovery/:token" element={user && user.reset_password ? <Navigate to="/" /> : <ResetPassword />}></Route>

                {/* default redirect to home page - send customer-creator to their dashboard */}
                {user && user.all_roles && (() => {
                    const has = (r) => normalizedRoles.includes((r || '').toString().toLowerCase());
                    const isCCOnly = has(ROLES.CustCreator) && ![ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager].some(has);
                    const isTechnicianOnly = has(ROLES.Technician) && ![ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.CustCreator].some(has);
                    const isDriverOnly = has(ROLES.Driver) && ![ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator].some(has);
                    if (isCCOnly) {
                        return <Route path="/" element={<Navigate to="/admin/customer-creater/dashboard" />} />
                    }
                    if (isDriverOnly) {
                        return <Route path="/" element={<Navigate to="/admin/fleet" />} />
                    }
                    if (isTechnicianOnly) {
                        return <Route path="/" element={<Navigate to="/admin/tickets/dashboard" />} />
                    }
                    if (normalizedRoles.some(role => ['super-administrator', 'administrator', 'manager'].includes(role))) {
                        return <Route path="/" element={<Navigate to="/admin" />} />
                    }
                    if (normalizedRoles.some(role => ['customer', 'reseller'].includes(role))) {
                        return <Route path="/" element={<Navigate to="/portal" />} />
                    }
                    return <Route path="/" element={<Navigate to="/admin" />} />
                })()}

                <Route element={<RequireAccess allowedRoles={[...Object.values(ROLES)]} />}>
                    <Route element={<RequireResetPassword />}>
                        <Route element={<Layout />}>
                            <Route path="profile" element={<UserProfile />}></Route>
                        </Route>

                        <Route path="admin" element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.CustCreator, ROLES.Technician, ROLES.Engineer, ROLES.Manager, ROLES.Driver]} />}>
                            <Route element={<Layout />}>
                                {/* Default landing per role */}
                                <Route index element={(() => {
                                    const has = (r) => normalizedRoles.includes((r || '').toString().toLowerCase());
                                    const isDriverOnly = has(ROLES.Driver) && ![ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator].some(has);
                                    if (isDriverOnly) {
                                        return <Navigate to="/admin/fleet" replace />;
                                    }
                                    if (user && user.all_roles && normalizedRoles.includes(ROLES.CustCreator) && !normalizedRoles.some(role => [ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager].includes(role))) {
                                        return <CustomerCreatorDashboard />;
                                    }
                                    return <Homepage />;
                                })()}></Route>
                                {/* Admin and Manager sections */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager]} />}>
                                    <Route path="networking/routers/add" element={<AddRouter />}></Route>
                                    <Route path="networking/routers/list" element={<ListRouter />}></Route>
                                    <Route path="networking/routers/view/:id" element={<ViewRouter />}></Route>
                                    <Route path="bandwidth" element={<BandwidthRouter />}></Route>

                                    <Route path="finance/dashboard" element={<FinanceDashboard />}></Route>
                                    <Route path="finance/payments" element={<FinancePayments />}></Route>
                                    <Route path="finance/invoices" element={<FinanceInvoices />}></Route>
                                    <Route path="finance/mpesa" element={<FinanceMpesa />}></Route>
                                    <Route path="finance/mpesa-tracker" element={<MpesaTracker />}></Route>
                                    <Route path="finance/expired-accounts-tracker" element={<ExpiredAccountsTracker />}></Route>
                                    <Route path="finance/new-customers" element={<NewCustomerTracker />}></Route>
                                    <Route path="finance/manual-payments" element={<ManualPayments />}></Route>
                                    <Route path="finance/report" element={<FinancialReport />}></Route>
                                    <Route path="finance/backup-sync" element={<BackupSync />}></Route>
                                    <Route path="finance/kra-operations" element={<KraOperations />}></Route>
                                    <Route path="finance/kra-auto" element={<KraAutoInvoicing />}></Route>
                                    <Route path="finance/kra-receipt-preview" element={<KraReceiptPreview />}></Route>
                                    <Route path="finance/kra-invoices/:traderInvoiceNo" element={<KraInvoiceBrowser />}></Route>

                                    <Route path="customers/add" element={<AddCustomer />}></Route>
                                    <Route path="customers/online" element={<OnlineCustomer />}></Route>
                                    <Route path="customers/list" element={<ListCustomer />}></Route>
                                    <Route path="customers/view/:id" element={<ViewCustomer />}></Route>
                                    <Route path="credit/:id" element={<Credit />}></Route>

                                    <Route path="tariffs/internet--add" element={<AddTariffInternet />}></Route>
                                    <Route path="tariffs/internet" element={<ListTariffInternet />}></Route>
                                    <Route path="tariffs/internet--edit/:id" element={<EditTariffInternet />}></Route>

                                    <Route path="administration" element={<ViewAdministration />}></Route>
                                    <Route path="administration/administrators" element={<ListAdministrationAdministrators />}></Route>
                                    <Route path="administration/roles" element={<ListAdministrationRoles />}></Route>

                                    <Route path="splynx-data" element={<SplynxData />}></Route>
                                    <Route path="expired-accounts" element={<ExpiredAccounts />}></Route>
                                </Route>

                                {/* Activity Logs - Admin, Super Admin, and Manager only */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager]} />}>
                                    <Route path="logs/list" element={<ActivityLogsList />}></Route>
                                    <Route path="logs/active-users" element={<ActiveUsers />}></Route>
                                </Route>

                                {/* SMS - Allow Admin, Manager, and technical roles */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer]} />}>
                                    <Route path="sms/dashboard" element={<SMSDashboard />}></Route>
                                    <Route path="sms/outbox" element={<Outbox />}></Route>
                                    <Route path="sms/outbox/:id" element={<ViewMessage />}></Route>
                                    <Route path="sms/send-single" element={<SendSingleSMS />}></Route>
                                    <Route path="sms/send-group" element={<SendGroupSMS />}></Route>
                                    <Route path="sms/send-bulk" element={<SendBulkSMS />}></Route>
                                    <Route path="sms/reports" element={<SmsReports />}></Route>
                                </Route>

                                {/* WhatsApp - Admin and Manager */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager]} />}>

                                    <Route path="whatsapp/outbox" element={<OutboxWhatsapp />}></Route>
                                    <Route path="whatsapp/outbox/:id" element={<ViewWhatsappMessage />}></Route>
                                    <Route path="whatsapp/inbox" element={<InboxWhatsapp />}></Route>
                                    <Route path="whatsapp-chat" element={<Chat />}></Route>
                                </Route>

                                {/* Tickets - Admins, Manager, Technicians, and Customer Creators */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator]} />}>
                                    <Route path="tickets/dashboard" element={<TicketsDashboard />}></Route>
                                    <Route path="tickets/list" element={<TicketsList />}></Route>
                                    <Route path="tickets/view/:id" element={<TicketView />}></Route>
                                    <Route path="tickets/create" element={<TicketCreate />}></Route>
                                    <Route path="tickets/daily-schedule" element={<DailySchedule />}></Route>
                                    <Route path="tickets/closed" element={<ClosedTickets />}></Route>
                                    <Route path="tickets/archive" element={<TicketsArchive />}></Route>
                                    <Route path="tickets/installations" element={<Installations />}></Route>
                                    <Route path="tickets/installations/archived" element={<ArchivedInstallations />}></Route>
                                    <Route path="tickets/routers" element={<Routers />}></Route>
                                    <Route path="tickets/reports" element={<TicketsReports />}></Route>
                                    <Route path="tickets/reports/los" element={<LOSReport />}></Route>
                                    <Route path="tickets/reports/installations" element={<InstallationReport />}></Route>
                                    <Route path="tickets/reports/management" element={<ReportsManagement />}></Route>
                                    
                                    {/* Bonus System — disabled */}
                                    {/* <Route path="bonus/dashboard" element={<BonusDashboard />}></Route> */}
                                    {/* <Route path="bonus/summary" element={<BonusSummary />}></Route> */}
                                    {/* <Route path="bonus/history" element={<BonusPaymentHistory />}></Route> */}
                                </Route>

                                {/* Daily team roster bulletin — managers & admins */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager]} />}>
                                    <Route path="tickets/daily-roster" element={<DailyRoster />}></Route>
                                </Route>

                                {/* Hotspot — external ISP admin panel */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager]} />}>
                                    <Route path="hotspot/*" element={<HotspotRedirect />}></Route>
                                </Route>

                                {/* Fiber map — live from database (auto-updates after import) */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator, ROLES.Driver]} />}>
                                    <Route path="networking/fiber/map" element={<NetworkMap />}></Route>
                                </Route>

                                {/* Legacy QGIS static export (optional — requires layer file regeneration) */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator, ROLES.Driver]} />}>
                                    <Route path="networking/fiber/map-qgis" element={<NetworkMapQGISIframe />}></Route>
                                </Route>

                                {/* Fiber lists — not for drivers */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator]} />}>
                                    <Route path="networking/fiber/fat" element={<FatList />}></Route>
                                    <Route path="networking/fiber/closures" element={<ClosureList />}></Route>
                                    <Route path="networking/fiber/infrastructure" element={<InfrastructureList />}></Route>
                                </Route>

                                {/* Fiber GeoJSON Import - Admins, Managers and Engineers */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Engineer]} />}>
                                    <Route path="networking/fiber/import-geojson" element={<ImportGeojsonAndMap />}></Route>
                                </Route>

                                {/* Fleet — drivers and managers only */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Driver]} />}>
                                    <Route path="fleet" element={<FleetRoster />}></Route>
                                    <Route path="fleet/log" element={<FleetLog />}></Route>
                                    <Route path="fleet/care" element={<FleetCare />}></Route>
                                    <Route path="fleet/cleaning" element={<FleetCleaning />}></Route>
                                    <Route path="fleet/dashboard" element={<FleetDashboard />}></Route>
                                </Route>

                                {/* Inventory - Admins, Managers and Technicians */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer]} />}>
                                    <Route path="inventory/dashboard" element={<InventoryDashboard />}></Route>
                                    <Route path="inventory/list" element={<InventoryList />}></Route>
                                    <Route path="inventory/disbursed" element={<InventoryDisbursed />}></Route>
                                    <Route path="inventory/assignment-history" element={<InventoryAssignmentHistory />}></Route>
                                    <Route path="inventory/discarded" element={<InventoryDiscardedCable />}></Route>
                                    <Route path="inventory/my-items" element={<InventoryMyItems />}></Route>
                                    <Route path="inventory/item-logs" element={<InventoryItemLogs />}></Route>
                                    <Route path="inventory/cable-usage" element={<InventoryCableUsage />}></Route>
                                </Route>

                                {/* Customer Creator section - Accessible by Customer Creators, Technicians, and Engineers */}
                                <Route element={<RequireAccess allowedRoles={[ROLES.CustCreator, ROLES.Technician, ROLES.Engineer]} />}>
                                    <Route path="customer-creater/dashboard" element={<CustomerCreatorDashboard />}></Route>
                                    <Route path="customer-creater/add" element={<CustomerCreatorAdd />}></Route>
                                    <Route path="customer-creater/list" element={<CustomerCreatorList />}></Route>
                                </Route>
                            </Route>
                        </Route>

                        <Route path="portal" element={<RequireAccess allowedRoles={[ROLES.Reseller, ROLES.Customer]} />}>
                            <Route element={<Layout />}>
                                <Route index element={<CustHomepage />}></Route>
                                <Route path="services" element={<Services />}></Route>
                                <Route path="finance/invoices" element={<Invoices />}></Route>
                                <Route path="finance/payments" element={<Payment />}></Route>
                                <Route path="invoice-details/:id" element={<InvoiceDetails />}></Route>
                                <Route path="statistics/internet-statistics" element={<InternetStats />}></Route>
                            </Route>
                        </Route>
                    </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" />}></Route>
            </Route>

            <Route path="/" element={<LayoutNoSidebar />}>
                <Route element={<RedirectLogged />}>
                    {process.env.SIGNUP && (<Route path="register" element={<Signup />}></Route>)}
                    <Route path="login" element={<Login />}></Route>
                    <Route path="password/reset" element={<ForgotPassword />}></Route>
                    <Route path="password/reset-confirm" element={<ResetPassword />}></Route>
                    {/*<Route path="forgot-password" element={<ForgotPassword />}></Route>
                    <Route path="reset-password/:token" element={<ResetPassword />}></Route>*/}
                </Route>
                <Route path="*" element={<Error404Modern />}></Route>
            </Route>
        </Routes>
    );
};

const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(Router);