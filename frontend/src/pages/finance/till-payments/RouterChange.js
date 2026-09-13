import React from "react";
import FeeList from "./FeeList";
import { TILL_FEE_CONFIG } from "../../../helpers/tillPayments";

const RouterChangePage = () => <FeeList config={TILL_FEE_CONFIG.router_change} />;
export default RouterChangePage;
