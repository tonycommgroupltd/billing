import React from "react";
import FeeList from "./FeeList";
import { TILL_FEE_CONFIG } from "../../../helpers/tillPayments";

const ExtensionPage = () => <FeeList config={TILL_FEE_CONFIG.extension} />;
export default ExtensionPage;
