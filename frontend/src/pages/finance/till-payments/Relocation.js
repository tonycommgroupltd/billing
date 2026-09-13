import React from "react";
import FeeList from "./FeeList";
import { TILL_FEE_CONFIG } from "../../../helpers/tillPayments";

const RelocationPage = () => <FeeList config={TILL_FEE_CONFIG.relocation} />;
export default RelocationPage;
