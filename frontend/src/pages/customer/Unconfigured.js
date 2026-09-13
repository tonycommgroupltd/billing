import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { connect } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Spinner, Table } from 'reactstrap';
import Head from '../../layout/head/Head';
import Content from '../../layout/content/Content';
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from '../../components/Component';
import TicketsAPI from '../../helpers/TicketsAPI';
import {
  prepareTicketCustomer,
  resolveCustomerByPhone,
  extractTicketsFromApiPayload,
} from '../../helpers/authorizeTicketCustomer';
import {
  getTicketCustomerAddress,
  getTicketCustomerName,
  getTicketCustomerPhone,
  getTicketPackage,
  getTicketPinLocation,
  getTicketTypeLabel,
  isEligibleUnconfiguredTicket,
  upsertUnconfiguredRevokedLine,
} from '../../utils/ticketInstallationDetails';
import { showError, showSuccess } from '../../utils/notifications';

const TYPE_FETCHES = ['Installation', 'Installation 2', 'Relocation'];

/** Run async work over items with a fixed concurrency (avoids API 429). */
async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const Unconfigured = ({ user }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [authorizingId, setAuthorizingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [checkingPhones, setCheckingPhones] = useState(false);

  const actorName =
    user?.display_name || user?.name || user?.username || user?.email || 'System';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const responses = await Promise.all(
        TYPE_FETCHES.map((type) =>
          TicketsAPI.getAll({ type, per_page: 10000 }).catch(() => ({ data: [] }))
        )
      );

      const byId = new Map();
      responses.forEach((response) => {
        extractTicketsFromApiPayload(response).forEach((ticket) => {
          if (ticket?.id != null) byId.set(ticket.id, ticket);
        });
      });

      const eligible = Array.from(byId.values())
        .filter(isEligibleUnconfiguredTicket)
        .sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
          const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
          return bTime - aTime;
        })
        .map((ticket) => ({
          ticket,
          existingCustomer: null,
          phoneChecked: false,
        }));

      setRows(eligible);

      // Phone checks: one Laravel call per unique phone, max 2 in flight.
      // Promise.all over every row was hitting throttle:api (60/min) → 429.
      setCheckingPhones(true);
      const uniquePhones = [];
      const phoneKeyByRow = eligible.map((row) => {
        const phone = getTicketCustomerPhone(row.ticket) || '';
        if (phone && !uniquePhones.includes(phone)) uniquePhones.push(phone);
        return phone;
      });
      const lookupByPhone = new Map();
      await mapPool(uniquePhones, 2, async (phone) => {
        try {
          const lookup = await resolveCustomerByPhone(phone);
          lookupByPhone.set(phone, lookup.exists ? lookup.customer : null);
        } catch {
          lookupByPhone.set(phone, null);
        }
      });
      setRows(
        eligible.map((row, index) => ({
          ...row,
          phoneChecked: true,
          existingCustomer: lookupByPhone.get(phoneKeyByRow[index]) || null,
        }))
      );
    } catch (error) {
      console.error(error);
      showError(error?.message || 'Failed to load unconfigured tickets.');
      setRows([]);
    } finally {
      setLoading(false);
      setCheckingPhones(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(({ ticket }) => {
      const haystack = [
        ticket.number,
        ticket.id,
        getTicketCustomerName(ticket),
        getTicketCustomerPhone(ticket),
        getTicketCustomerAddress(ticket),
        getTicketPackage(ticket),
        getTicketTypeLabel(ticket),
        ticket.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search]);

  const handleAuthorize = async (row) => {
    const ticket = row.ticket;
    const exists = Boolean(row.existingCustomer);
    const actionLabel = exists
      ? 'open the existing customer and walk through adding a service'
      : 'create the customer, then walk through adding a service step by step';
    const ok = window.confirm(
      `Authorize ticket ${ticket.number || `#${ticket.id}`}?\n\nThis will ${actionLabel}.`
    );
    if (!ok) return;

    setAuthorizingId(ticket.id);
    let navigatedAway = false;
    try {
      const prepared = await prepareTicketCustomer(ticket);
      if (!prepared?.customer?.id) {
        throw new Error('Could not resolve a billing customer for this ticket.');
      }

      // Always open the service wizard — even if the customer already has a service
      // (second install / second service). This ticket only leaves Unconfigured after
      // the service is actually added (Configured line on this ticket id).
      const params = new URLSearchParams({
        addService: '1',
        ticketId: String(ticket.id),
        package: prepared.packageName || '',
        planId: String(prepared.plan?.id || ''),
        mikrotikName: prepared.mikrotikName || '',
        mikrotikPassword: prepared.mikrotikPassword || '',
        installation: '1',
        customerCreated: prepared.customerCreated ? '1' : '0',
        actor: actorName,
      });
      showSuccess(
        prepared.customerCreated
          ? `Customer created. Continue with the service wizard.`
          : `Existing customer found. Continue with the service wizard.`
      );
      setRows((current) => current.filter((item) => item.ticket.id !== ticket.id));
      navigatedAway = true;
      navigate(`/admin/customers/view/${prepared.customer.id}?${params.toString()}`);
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.[Object.keys(error?.response?.data || {})[0]]?.[0] ||
        error?.message ||
        'Authorization failed.';
      showError(typeof message === 'string' ? message : 'Authorization failed.');
    } finally {
      // Navigating unmounts this page — skip setState to avoid the React warning.
      if (!navigatedAway) setAuthorizingId(null);
    }
  };

  const handleRemove = async (row) => {
    const ticket = row.ticket;
    const label = ticket.number || `#${ticket.id}`;
    const ok = window.confirm(
      `Remove ${label} from Unconfigured?\n\n` +
        `This only hides it from this list. The ticket and customer details stay in your records ` +
        `(ticket view / tickets DB). You can still open the ticket later.`
    );
    if (!ok) return;

    setRemovingId(ticket.id);
    try {
      const when = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const description = upsertUnconfiguredRevokedLine(
        ticket.description,
        `by ${actorName} on ${when}`
      );
      await TicketsAPI.update(ticket.id, { description });
      setRows((current) => current.filter((item) => item.ticket.id !== ticket.id));
      showSuccess(`${label} removed from Unconfigured. Records kept.`);
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Could not remove from Unconfigured.';
      showError(typeof message === 'string' ? message : 'Could not remove from Unconfigured.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <React.Fragment>
      <Head title="Unconfigured Customers" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Unconfigured</BlockTitle>
              </BlockHeadContent>
            <BlockHeadContent>
              <Button color="primary" onClick={load} disabled={loading}>
                <Icon name="reload" />
                <span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <PreviewCard>
            <div className="d-flex flex-wrap justify-between align-center g-2 mb-3">
              <div className="form-control-wrap" style={{ minWidth: 240, maxWidth: 360, flex: 1 }}>
                <div className="form-icon form-icon-left">
                  <Icon name="search" />
                </div>
                <input
                  type="search"
                  className="form-control"
                  placeholder="Search name, phone, package, ticket..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="text-soft">
                {checkingPhones ? 'Checking existing phones…' : `${filteredRows.length} ready`}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-5 text-soft">
                No unconfigured installation or relocation tickets with complete customer details (name, phone, address, package, and pin).
              </div>
            ) : (
              <div className="table-responsive">
                <Table className="nk-tb-list nk-tb-ulist">
                  <thead>
                    <tr className="nk-tb-item nk-tb-head">
                      <th className="nk-tb-col">Ticket</th>
                      <th className="nk-tb-col">Customer</th>
                      <th className="nk-tb-col tb-col-md">Phone</th>
                      <th className="nk-tb-col tb-col-lg">Address</th>
                      <th className="nk-tb-col">Package</th>
                      <th className="nk-tb-col tb-col-lg">Pin</th>
                      <th className="nk-tb-col tb-col-md">Status</th>
                      <th className="nk-tb-col nk-tb-col-tools text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const { ticket, existingCustomer, phoneChecked } = row;
                      const busy = authorizingId === ticket.id || removingId === ticket.id;
                      const exists = Boolean(existingCustomer);
                      const pin = getTicketPinLocation(ticket);
                      return (
                        <tr key={ticket.id} className="nk-tb-item">
                          <td className="nk-tb-col">
                            <Link to={`/admin/tickets/view/${ticket.id}`} className="fw-bold">
                              {ticket.number || `#${ticket.id}`}
                            </Link>
                            <div className="text-soft small">{getTicketTypeLabel(ticket)}</div>
                          </td>
                          <td className="nk-tb-col">
                            <span className="tb-lead">{getTicketCustomerName(ticket)}</span>
                            {phoneChecked && (
                              <div className="mt-1">
                                {exists ? (
                                  <Badge color="info" className="badge-dim">Existing customer</Badge>
                                ) : (
                                  <Badge color="warning" className="badge-dim">New customer</Badge>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="nk-tb-col tb-col-md">{getTicketCustomerPhone(ticket)}</td>
                          <td className="nk-tb-col tb-col-lg">{getTicketCustomerAddress(ticket)}</td>
                          <td className="nk-tb-col">
                            <Badge color="primary" className="badge-dim">{getTicketPackage(ticket)}</Badge>
                          </td>
                          <td className="nk-tb-col tb-col-lg">
                            {pin ? (
                              <a
                                href={`https://www.google.com/maps?q=${pin.latitude},${pin.longitude}&z=17`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="small"
                              >
                                {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                              </a>
                            ) : (
                              <span className="text-soft">—</span>
                            )}
                          </td>
                          <td className="nk-tb-col tb-col-md">
                            <span className="text-soft text-capitalize">{ticket.status || '—'}</span>
                          </td>
                          <td className="nk-tb-col nk-tb-col-tools text-end">
                            <div className="d-inline-flex align-items-center g-1" style={{ gap: 8 }}>
                              <Button
                                color={exists ? 'info' : 'success'}
                                size="sm"
                                disabled={busy}
                                onClick={() => handleAuthorize(row)}
                              >
                                {authorizingId === ticket.id ? (
                                  <>
                                    <Spinner size="sm" /> <span>Working…</span>
                                  </>
                                ) : exists ? (
                                  'Add service'
                                ) : (
                                  'Authorize'
                                )}
                              </Button>
                              <Button
                                color="light"
                                size="sm"
                                className="btn-outline-danger"
                                disabled={busy}
                                title="Remove from Unconfigured (keeps ticket & details)"
                                onClick={() => handleRemove(row)}
                              >
                                {removingId === ticket.id ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <>
                                    <Icon name="trash" />
                                    <span>Remove</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth?.currentUser || null,
});

export default connect(mapStateToProps)(Unconfigured);
