import React, { useLayoutEffect, Suspense, lazy } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { connect } from 'react-redux';

import RequireAuth from './RequireAuth';
import RequireAccess from './RequireAccess';
import RedirectLogged from "./RedirectLogged";
import RequireResetPassword from "./RequireResetPassword";

import { ROLES } from '../config/roles'

import LayoutNoSidebar from "../layout/Index-nosidebar";
import Layout from "../layout/Index";

const Homepage = lazy(() => import("../pages/Homepage"));
const CustHomepage = lazy(() => import("../pages/customer/Homepage"));
const Login = lazy(() => import("../pages/auth/Login"));
const Signup = lazy(() => import("../pages/auth/Register"));
const ForgotPassword = lazy(() => import("../pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));
const VerifyPhone = lazy(() => import("../pages/auth/VerifyPhone"));
const AddRouter = lazy(() => import("../pages/networking/routers/Add"));
const ListRouter = lazy(() => import("../pages/networking/routers/List"));
const ViewRouter = lazy(() => import("../pages/networking/routers/View"));
const BandwidthRouter = lazy(() => import("../pages/networking/routers/Bandwidth"));
const Ipv4Dashboard = lazy(() => import("../pages/networking/ipv4/Ipv4Dashboard"));
const Ipv4Add = lazy(() => import("../pages/networking/ipv4/Ipv4Add"));
const Ipv4List = lazy(() => import("../pages/networking/ipv4/Ipv4List"));
const VpnDashboard = lazy(() => import("../pages/networking/vpn/VpnDashboard"));
const VpnAdd = lazy(() => import("../pages/networking/vpn/VpnAdd"));
const VpnList = lazy(() => import("../pages/networking/vpn/VpnList"));
const FinanceDashboard = lazy(() => import("../pages/finance/Dashboard"));
const FinancePayments = lazy(() => import("../pages/finance/payment/List"));
const FinanceInvoices = lazy(() => import("../pages/finance/invoice/List"));
const FinanceMpesa = lazy(() => import("../pages/finance/mpesa/List"));
const TillPaymentsDashboard = lazy(() => import("../pages/finance/till-payments/Dashboard"));
const TillRelocation = lazy(() => import("../pages/finance/till-payments/Relocation"));
const TillRouterChange = lazy(() => import("../pages/finance/till-payments/RouterChange"));
const TillExtension = lazy(() => import("../pages/finance/till-payments/Extension"));
// Till Payments replaces legacy finance/relocation routes
const MpesaTracker = lazy(() => import("../pages/finance/MpesaTracker"));
const NewCustomerTracker = lazy(() => import("../pages/finance/NewCustomerTracker"));
const ManualPayments = lazy(() => import("../pages/finance/ManualPayments"));
const FinancialReport = lazy(() => import("../pages/finance/FinancialReport"));
// Documents feature parked — menu commented out; keep routes lazy so compile stays clean
// const FinanceQuotations = lazy(() =>
//   import("../pages/finance/documents").then((m) => ({ default: m.QuotationsPage }))
// );
// const FinanceDocInvoices = lazy(() =>
//   import("../pages/finance/documents").then((m) => ({ default: m.DocInvoicesPage }))
// );
// const FinanceLetterHead = lazy(() =>
//   import("../pages/finance/documents").then((m) => ({ default: m.LetterHead }))
// );
const AddCustomer = lazy(() => import("../pages/customer/Add"));
const OnlineCustomer = lazy(() => import("../pages/customer/Online"));
const ListCustomer = lazy(() => import("../pages/customer/List"));
const ViewCustomer = lazy(() => import("../pages/customer/View"));
const UnconfiguredCustomers = lazy(() => import("../pages/customer/Unconfigured"));
const SmartOlt = lazy(() => import("../pages/customer/SmartOlt"));
const Credit = lazy(() => import("../pages/customer/Credit"));
const Services = lazy(() => import("../pages/customer/Services"));
const Invoices = lazy(() => import("../pages/customer/Invoices"));
const InvoiceDetails = lazy(() => import("../pages/customer/InvoiceDetails"));
const AddTariffInternet = lazy(() => import("../pages/tariffs/internet/Add"));
const ListTariffInternet = lazy(() => import("../pages/tariffs/internet/List"));
const EditTariffInternet = lazy(() => import("../pages/tariffs/internet/Edit"));
const BillingTypeCustomers = lazy(() => import("../pages/tariffs/BillingTypeCustomers"));
const PackageUsage = lazy(() => import("../pages/tariffs/PackageUsage"));
const ViewAdministration = lazy(() => import("../pages/administration/View"));
const HaAvailability = lazy(() => import("../pages/administration/HaAvailability"));
const HubSync = lazy(() => import("../pages/administration/HubSync"));
const ServerLogs = lazy(() => import("../pages/administration/ServerLogs"));
const AiDiagnostics = lazy(() => import("../pages/administration/AiDiagnostics"));
const ListAdministrationAdministrators = lazy(() => import("../pages/administration/administrators/List"));
const ListAdministrationRoles = lazy(() => import("../pages/administration/roles/List"));
const ListAdministrationPartners = lazy(() => import("../pages/administration/partners/List"));
const ListAdministrationLocations = lazy(() => import("../pages/administration/locations/List"));
const ListAdministrationApiKeys = lazy(() => import("../pages/administration/api-keys/List"));
const AdministrationMegaPay = lazy(() => import("../pages/administration/megapay/MegaPay"));
const AdministrationLicense = lazy(() => import("../pages/administration/license/View"));
const AdministrationReport = lazy(() => import("../pages/administration/reports/Report"));
const AdministrationInfo = lazy(() => import("../pages/administration/info/InfoPage"));
const DeletionApprovals = lazy(() => import("../pages/administration/DeletionApprovals"));
const IctDailyReport = lazy(() => import("../pages/ict/DailyReport"));
const Outbox = lazy(() => import("../pages/sms/Outbox"));
const ViewMessage = lazy(() => import("../pages/sms/View"));
const SendSingleSms = lazy(() => import("../pages/sms/SendSingle"));
const SendGroupSms = lazy(() => import("../pages/sms/SendGroup"));
const SendBulkSms = lazy(() => import("../pages/sms/SendBulk"));
const SmsReport = lazy(() => import("../pages/sms/Report"));
const OutboxWhatsapp = lazy(() => import("../pages/whatsapp/Outbox"));
const InboxWhatsapp = lazy(() => import("../pages/whatsapp/Inbox"));
const ViewWhatsappMessage = lazy(() => import("../pages/whatsapp/View"));
const SendSingleWhatsapp = lazy(() => import("../pages/whatsapp/SendSingle"));
const SendGroupWhatsapp = lazy(() => import("../pages/whatsapp/SendGroup"));
const SendBulkWhatsapp = lazy(() => import("../pages/whatsapp/SendBulk"));
const WhatsappReport = lazy(() => import("../pages/whatsapp/Report"));
const Error404Modern = lazy(() => import("../pages/error/404-modern"));
const Payment = lazy(() => import("../pages/customer/Payment"));
const UserProfile = lazy(() => import("../pages/user/UserProfile"));
const InternetStats = lazy(() => import("../pages/customer/InternetStats"));
const OltMonitoring = lazy(() => import("../pages/company/OltMonitoring"));
const OltDetail = lazy(() => import("../pages/company/OltDetail"));
const Tr069 = lazy(() => import("../pages/company/Tr069"));
const Tr069DeviceDetail = lazy(() => import("../pages/company/Tr069DeviceDetail"));
const MobileAdmin = lazy(() => import("../pages/company/Mobile"));
const CompanyProfile = lazy(() => import("../pages/company/CompanyProfile"));
const TicketsDashboard = lazy(() => import("../pages/tickets/Dashboard"));
const TicketsList = lazy(() => import("../pages/tickets/List"));
const TicketView = lazy(() => import("../pages/tickets/View"));
const TicketCreate = lazy(() => import("../pages/tickets/Create"));
const DailySchedule = lazy(() => import("../pages/tickets/DailySchedule"));
const DailyRoster = lazy(() => import("../pages/tickets/DailyRoster"));
const ClosedTickets = lazy(() => import("../pages/tickets/Closed"));
const TicketsArchive = lazy(() => import("../pages/tickets/Archive"));
const Installations = lazy(() => import("../pages/tickets/Installations"));
const ArchivedInstallations = lazy(() => import("../pages/tickets/ArchivedInstallations"));
const Routers = lazy(() => import("../pages/tickets/Routers"));
const TicketsReports = lazy(() => import("../pages/tickets/Reports"));
const LOSReport = lazy(() => import("../pages/tickets/LOSReport"));
const InstallationReport = lazy(() => import("../pages/tickets/InstallationReport"));
const ReportsManagement = lazy(() => import("../pages/tickets/ReportsManagement"));
const LeadsDashboard = lazy(() => import("../pages/leads/Dashboard"));
const LeadsAdd = lazy(() => import("../pages/leads/Add"));
const LeadsList = lazy(() => import("../pages/leads/List"));
const InventoryDashboard = lazy(() => import("../pages/inventory/Dashboard"));
const InventoryList = lazy(() => import("../pages/inventory/List"));
const InventoryDisbursed = lazy(() => import("../pages/inventory/Disbursed"));
const InventoryAssignmentHistory = lazy(() => import("../pages/inventory/AssignmentHistory"));
const InventoryDiscardedCable = lazy(() => import("../pages/inventory/DiscardedCable"));
const InventoryMyItems = lazy(() => import("../pages/inventory/MyInventory"));
const InventoryItemLogs = lazy(() => import("../pages/inventory/ItemLogs"));
const InventoryCableUsage = lazy(() => import("../pages/inventory/CableUsage"));
const HotspotDashboard = lazy(() => import("../pages/hotspot/Dashboard"));
const HotspotUsers = lazy(() => import("../pages/hotspot/Users"));
const HotspotSessions = lazy(() => import("../pages/hotspot/Sessions"));
const HotspotAuthLocations = lazy(() => import("../pages/hotspot/AuthLocations"));
const HotspotLogs = lazy(() => import("../pages/hotspot/Logs"));
const FleetRoster = lazy(() => import("../pages/fleet/FleetRoster"));
const FleetLog = lazy(() => import("../pages/fleet/FleetLog"));
const FleetCare = lazy(() => import("../pages/fleet/FleetCare"));
const FleetCleaning = lazy(() => import("../pages/fleet/FleetCleaning"));
const FleetDashboard = lazy(() => import("../pages/fleet/FleetDashboard"));
const TICKET_ROLES = [
    ROLES.SuperAdmin, ROLES.ICT,
    ROLES.Admin,
    ROLES.Manager,
    ROLES.Technician,
    ROLES.Engineer,
    ROLES.CustCreator,
];

const FLEET_ROLES = [
    ROLES.SuperAdmin,
    ROLES.ICT,
    ROLES.Admin,
    ROLES.Manager,
    ROLES.Driver,
    ROLES.Technician,
    ROLES.Engineer,
];

const LEAD_ROLES = [...TICKET_ROLES, ROLES.CustomerCare];


const Router = ({ user }) => {
    const location = useLocation();
    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, [location]);

    const roles = (user?.all_roles || []).map((r) => (r || "").toString().toLowerCase());
    const hasRole = (r) => roles.includes((r || "").toString().toLowerCase());
    const isDriverOnly =
        hasRole(ROLES.Driver) &&
        ![ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator].some(hasRole);

    return (
        <Suspense fallback={<div className="nk-content d-flex justify-content-center align-items-center" style={{ minHeight: "40vh" }}><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>}>
        <Routes>
            <Route path={`${process.env.PUBLIC_URL}`} element={<RequireAuth />}>
                <Route path="auth/otp/verify" element={<VerifyPhone />}></Route>
                <Route path="auth/password/recovery/:token" element={user && user.reset_password ? <Navigate to="/" /> : <ResetPassword />}></Route>

                {/* default redirect to home page */}
                {user && user.all_roles && (
                    isDriverOnly ? (
                        <Route path="/" element={<Navigate to="/admin/fleet" />} />
                    ) : user.all_roles.some(role => ['super-administrator', 'ict', 'administrator', 'manager', 'financial-manager', 'customer-care', 'technician', 'engineer', 'customer-creator', 'driver'].includes(role)) ? (
                        <Route path="/" element={<Navigate to="/admin" />} />
                    ) : (
                        <Route path="/" element={<Navigate to="/portal" />} />
                    )
                )}

                <Route element={<RequireAccess allowedRoles={[...Object.values(ROLES)]} />}>
                    <Route element={<RequireResetPassword />}>
                        <Route element={<Layout />}>
                            <Route path="profile" element={<UserProfile />}></Route>
                        </Route>

                        <Route path="admin" element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager, ROLES.FinManager, ROLES.CustomerCare, ROLES.Technician, ROLES.Engineer, ROLES.CustCreator, ROLES.Driver]} />}>
                            <Route element={<Layout />}>
                                <Route
                                  index
                                  element={
                                    isDriverOnly ? (
                                      <Navigate to="/admin/fleet" replace />
                                    ) : (
                                      <Homepage />
                                    )
                                  }
                                ></Route>

                                <Route path="customers/add" element={<AddCustomer />}></Route>
                                <Route path="customers/online" element={<OnlineCustomer />}></Route>
                                <Route path="customers/list" element={<ListCustomer />}></Route>
                                <Route path="customers/unconfigured" element={<UnconfiguredCustomers />}></Route>
                                <Route path="customers/smartolt" element={<SmartOlt />}></Route>
                                <Route path="customers/view/:id" element={<ViewCustomer />}></Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager, ROLES.FinManager, ROLES.CustomerCare]} />}>
                                <Route element={<Layout />}>
                                    <Route path="ict/daily-report" element={<IctDailyReport />}></Route>
                                    <Route path="administration/deletion-approvals" element={<DeletionApprovals />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager, ROLES.CustomerCare]} />}>
                                <Route element={<Layout />}>
                                    <Route path="ai-diagnostics" element={<AiDiagnostics />}></Route>
                                </Route>
                            </Route>
                            {/* Finance: manager — invoices/payments/mpesa/new-customers only */}
                            {/* Administrator — no mpesa-tracker / financial report (super-admin, ICT, fin-manager keep them) */}
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.FinManager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="finance/dashboard" element={<FinanceDashboard />}></Route>
                                    <Route path="finance/manual-payments" element={<ManualPayments />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.FinManager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="finance/mpesa-tracker" element={<MpesaTracker />}></Route>
                                    <Route path="finance/report" element={<FinancialReport />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.FinManager, ROLES.Manager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="finance/payments" element={<FinancePayments />}></Route>
                                    <Route path="finance/invoices" element={<FinanceInvoices />}></Route>
                                    <Route path="finance/mpesa" element={<FinanceMpesa />}></Route>
                                    <Route path="finance/till-payments" element={<TillPaymentsDashboard />}></Route>
                                    <Route path="finance/till-payments/relocation" element={<TillRelocation />}></Route>
                                    <Route path="finance/till-payments/router-change" element={<TillRouterChange />}></Route>
                                    <Route path="finance/till-payments/extension" element={<TillExtension />}></Route>
                                    <Route path="finance/relocation" element={<Navigate to="/admin/finance/till-payments/relocation" replace />}></Route>
                                    <Route path="finance/relocation/dashboard" element={<Navigate to="/admin/finance/till-payments" replace />}></Route>
                                    <Route path="finance/new-customers" element={<NewCustomerTracker />}></Route>
                                    {/* Documents routes parked with menu
                                    <Route path="finance/documents/quotations" element={<FinanceQuotations />}></Route>
                                    <Route path="finance/documents/invoices" element={<FinanceDocInvoices />}></Route>
                                    <Route path="finance/documents/letterhead" element={<FinanceLetterHead />}></Route>
                                    */}
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.FinManager, ROLES.Manager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="tariffs/internet--add" element={<AddTariffInternet />}></Route>
                                    <Route path="tariffs/internet" element={<ListTariffInternet />}></Route>
                                    <Route path="tariffs/internet--edit/:id" element={<EditTariffInternet />}></Route>
                                    <Route path="tariffs/package-usage" element={<PackageUsage />}></Route>
                                    <Route path="tariffs/recurring" element={<BillingTypeCustomers type="recurring" />}></Route>
                                    <Route path="tariffs/prepaid" element={<BillingTypeCustomers type="prepaid" />}></Route>

                                    <Route path="sms/outbox" element={<Outbox />}></Route>
                                    <Route path="sms/outbox/:id" element={<ViewMessage />}></Route>
                                    <Route path="sms/send-single" element={<SendSingleSms />}></Route>
                                    <Route path="sms/send-group" element={<SendGroupSms />}></Route>
                                    <Route path="sms/send-bulk" element={<SendBulkSms />}></Route>
                                    <Route path="sms/reports" element={<SmsReport />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="company/mobile" element={<MobileAdmin />}></Route>
                                    <Route path="company/profile" element={<CompanyProfile />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="networking/routers/add" element={<AddRouter />}></Route>
                                    <Route path="networking/routers/list" element={<ListRouter />}></Route>
                                    <Route path="networking/routers/view/:id" element={<ViewRouter />}></Route>
                                    <Route path="networking/ipv4" element={<Navigate to="networking/ipv4/dashboard" replace />}></Route>
                                    <Route path="networking/ipv4/dashboard" element={<Ipv4Dashboard />}></Route>
                                    <Route path="networking/ipv4/add" element={<Ipv4Add />}></Route>
                                    <Route path="networking/ipv4/list" element={<Ipv4List />}></Route>
                                    <Route path="networking/VPN" element={<Navigate to="networking/vpn/dashboard" replace />}></Route>
                                    <Route path="networking/vpn" element={<Navigate to="networking/vpn/dashboard" replace />}></Route>
                                    <Route path="networking/vpn/dashboard" element={<VpnDashboard />}></Route>
                                    <Route path="networking/vpn/add" element={<VpnAdd />}></Route>
                                    <Route path="networking/vpn/list" element={<VpnList />}></Route>
                                    <Route path="networking/routers/bandwidth" element={<BandwidthRouter />}></Route>
                                    <Route path="bandwidth" element={<Navigate to="networking/routers/bandwidth" replace />}></Route>

                                    <Route path="company/olt-monitoring" element={<OltMonitoring />}></Route>
                                    <Route path="company/olt-monitoring/:id" element={<OltDetail />}></Route>
                                    <Route path="company/tr069" element={<Tr069 />}></Route>
                                    <Route path="company/tr069/device/:id" element={<Tr069DeviceDetail />}></Route>

                                    <Route path="credit/:id" element={<Credit />}></Route>

                                    <Route path="administration" element={<ViewAdministration />}></Route>
                                    <Route path="administration/logs" element={<ServerLogs />}></Route>
                                    <Route path="administration/logs/:category" element={<ServerLogs />}></Route>
                                    <Route path="administration/high-availability" element={<HaAvailability />}></Route>
                                    <Route path="administration/hub-sync" element={<HubSync />}></Route>
                                    <Route path="administration/administrators" element={<ListAdministrationAdministrators />}></Route>
                                    <Route path="administration/roles" element={<ListAdministrationRoles />}></Route>
                                    <Route path="administration/partners" element={<ListAdministrationPartners />}></Route>
                                    <Route path="administration/locations" element={<ListAdministrationLocations />}></Route>
                                    <Route path="administration/api-keys" element={<ListAdministrationApiKeys />}></Route>
                                    <Route path="administration/megapay" element={<AdministrationMegaPay />}></Route>
                                    <Route path="administration/license" element={<AdministrationLicense />}></Route>
                                    <Route path="administration/splynx/license" element={<AdministrationLicense />}></Route>
                                    <Route path="administration/info/:topic" element={<AdministrationInfo />}></Route>
                                    <Route path="administration/reports/statistics-internet" element={<Navigate to="/admin/tariffs/package-usage" replace />}></Route>
                                    <Route path="administration/reports/ticket-reports" element={<Navigate to="/admin/tickets/reports" replace />}></Route>
                                    <Route path="administration/reports/:type" element={<AdministrationReport />}></Route>

                                    <Route path="whatsapp/outbox" element={<OutboxWhatsapp />}></Route>
                                    <Route path="whatsapp/outbox/:id" element={<ViewWhatsappMessage />}></Route>
                                    <Route path="whatsapp/inbox" element={<InboxWhatsapp />}></Route>
                                    <Route path="whatsapp/send-single" element={<SendSingleWhatsapp />}></Route>
                                    <Route path="whatsapp/send-group" element={<SendGroupWhatsapp />}></Route>
                                    <Route path="whatsapp/send-bulk" element={<SendBulkWhatsapp />}></Route>
                                    <Route path="whatsapp/reports" element={<WhatsappReport />}></Route>
                                </Route>
                            </Route>                            <Route element={<RequireAccess allowedRoles={LEAD_ROLES} />}>
                                <Route element={<Layout />}>
                                    <Route path="leads/dashboard" element={<LeadsDashboard />}></Route>
                                    <Route path="leads/add" element={<LeadsAdd />}></Route>
                                    <Route path="leads/list" element={<LeadsList />}></Route>
                                    <Route path="customer-creater/dashboard" element={<Navigate to="/admin/leads/dashboard" replace />}></Route>
                                    <Route path="customer-creater/add" element={<Navigate to="/admin/leads/add" replace />}></Route>
                                    <Route path="customer-creater/list" element={<Navigate to="/admin/leads/list" replace />}></Route>
                                </Route>
                            </Route>

                            <Route element={<RequireAccess allowedRoles={TICKET_ROLES} />}>
                                <Route element={<Layout />}>
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
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager]} />}>
                                <Route element={<Layout />}>
                                    <Route path="tickets/daily-roster" element={<DailyRoster />}></Route>

                                    <Route path="hotspot/dashboard" element={<HotspotDashboard />}></Route>
                                    <Route path="hotspot/auth-locations" element={<HotspotAuthLocations />}></Route>
                                    <Route path="hotspot/users" element={<HotspotUsers />}></Route>
                                    <Route path="hotspot/sessions" element={<HotspotSessions />}></Route>
                                    <Route path="hotspot/logs" element={<HotspotLogs />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={FLEET_ROLES} />}>
                                <Route element={<Layout />}>
                                    <Route path="fleet" element={<FleetRoster />}></Route>
                                    <Route path="fleet/log" element={<FleetLog />}></Route>
                                    <Route path="fleet/care" element={<FleetCare />}></Route>
                                    <Route path="fleet/cleaning" element={<FleetCleaning />}></Route>
                                    <Route path="fleet/dashboard" element={<FleetDashboard />}></Route>
                                </Route>
                            </Route>
                            <Route element={<RequireAccess allowedRoles={[ROLES.SuperAdmin, ROLES.ICT, ROLES.Admin, ROLES.Manager, ROLES.Technician, ROLES.Engineer]} />}>
                                <Route element={<Layout />}>
                                    <Route path="inventory/dashboard" element={<InventoryDashboard />}></Route>
                                    <Route path="inventory/list" element={<InventoryList />}></Route>
                                    <Route path="inventory/disbursed" element={<InventoryDisbursed />}></Route>
                                    <Route path="inventory/assignment-history" element={<InventoryAssignmentHistory />}></Route>
                                    <Route path="inventory/discarded" element={<InventoryDiscardedCable />}></Route>
                                    <Route path="inventory/my-items" element={<InventoryMyItems />}></Route>
                                    <Route path="inventory/item-logs" element={<InventoryItemLogs />}></Route>
                                    <Route path="inventory/cable-usage" element={<InventoryCableUsage />}></Route>
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

            <Route path={`${process.env.PUBLIC_URL}`} element={<LayoutNoSidebar />}>
                <Route element={<RedirectLogged />}>
                    {process.env.SIGNUP && (<Route path="register" element={<Signup />}></Route>)}
                    <Route path="login" element={<Login />}></Route>
                    <Route path="password/reset" element={<ForgotPassword />}></Route>
                    {/*<Route path="forgot-password" element={<ForgotPassword />}></Route>
                    <Route path="reset-password/:token" element={<ResetPassword />}></Route>*/}
                </Route>
                <Route path="*" element={<Error404Modern />}></Route>
            </Route>
        </Routes>
        </Suspense>
    );
};

const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(Router);