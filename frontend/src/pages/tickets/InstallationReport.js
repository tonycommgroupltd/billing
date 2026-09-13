import TypeReport from "./TypeReport";
import { INSTALLATION_REPORT_TYPES } from "../../config/ticketTypes";

export default function InstallationReport() {
  return <TypeReport title="Installation Full Report" types={INSTALLATION_REPORT_TYPES} />;
}
