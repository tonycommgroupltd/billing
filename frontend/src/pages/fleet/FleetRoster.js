import React, { useEffect, useMemo, useState } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import { Card, FormGroup, Label, Input, Spinner } from "reactstrap";
import { format, parseISO } from "date-fns";
import DailyRosterFleetPanel from "../../components/tickets/DailyRosterFleetPanel";
import FleetNav from "../../components/fleet/FleetNav";
import FleetPageLayout from "../../components/fleet/FleetPageLayout";
import TicketsAPI from "../../helpers/TicketsAPI";
import "./Fleet.css";

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

const FleetRoster = () => {
  const [rosterDate, setRosterDate] = useState(todayStr());
  const [driverOptions, setDriverOptions] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);

  const dateLabel = useMemo(() => {
    try {
      return format(parseISO(rosterDate), "EEEE, d MMMM yyyy");
    } catch {
      return rosterDate;
    }
  }, [rosterDate]);

  useEffect(() => {
    setLoadingDrivers(true);
    TicketsAPI.getAssignmentOptions()
      .then((list) => setDriverOptions(Array.isArray(list) ? list : []))
      .catch(() => setDriverOptions([]))
      .finally(() => setLoadingDrivers(false));
  }, []);

  return (
    <React.Fragment>
      <Head title="Fleet — Daily Operations" />
      <Content>
        <FleetPageLayout>
          <FleetNav />
          <BlockHead size="sm" className="fleet-page-head">
            <BlockHeadContent>
              <BlockTitle page>Daily Fleet Operations</BlockTitle>
            </BlockHeadContent>
          </BlockHead>

          <Block>
            <Card className="card-bordered mb-3 fleet-date-toolbar">
              <div className="card-inner py-3">
                <div className="fleet-date-toolbar__inner">
                  <FormGroup className="mb-0 fleet-date-toolbar__field">
                    <Label className="small text-uppercase text-muted mb-1">
                      <strong>Working date</strong>
                    </Label>
                    <Input
                      type="date"
                      value={rosterDate}
                      onChange={(e) => setRosterDate(e.target.value)}
                      className="fleet-touch-input"
                    />
                    <small className="text-muted d-block mt-1">{dateLabel}</small>
                  </FormGroup>
                  <Button
                    color="light"
                    className="fleet-btn-touch fleet-date-toolbar__today"
                    onClick={() => setRosterDate(todayStr())}
                  >
                    <Icon name="calendar" className="mr-1" />
                    Today
                  </Button>
                </div>
              </div>
            </Card>

            {loadingDrivers ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
                <p className="text-muted small mt-2 mb-0">Loading drivers…</p>
              </div>
            ) : driverOptions.length === 0 ? (
              <Card className="card-bordered">
                <div className="card-inner text-center py-4">
                  <p className="text-muted mb-0">
                    No technicians or engineers found for driver assignment.
                  </p>
                </div>
              </Card>
            ) : (
              <DailyRosterFleetPanel
                rosterDate={rosterDate}
                driverOptions={driverOptions}
                embedded
              />
            )}
          </Block>
        </FleetPageLayout>
      </Content>
    </React.Fragment>
  );
};

export default FleetRoster;
