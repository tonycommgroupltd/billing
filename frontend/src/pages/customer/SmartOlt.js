import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Modal,
  ModalBody,
  ModalHeader,
  Spinner,
  Table,
} from 'reactstrap';
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
  RSelect,
} from '../../components/Component';
import { http } from '../../helpers';
import { showError, showSuccess } from '../../utils/notifications';

const errorMessage = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message;
  }
  // Laravel validation bag: { field: ["error"] }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const first = Object.values(data).flat?.()?.[0];
    if (typeof first === 'string' && first.trim()) return first;
  }
  return error?.message || fallback;
};

const AUTH_STAGES = [
  { id: 'authorize', label: 'Authorizing ONU on the OLT' },
  { id: 'pppoe', label: 'Wiring PPPoE credentials' },
  { id: 'config', label: 'Applying management & TR-069' },
  { id: 'resync', label: 'Resyncing config to the ONU' },
];

const initialProgress = () => ({
  active: null,
  statuses: Object.fromEntries(AUTH_STAGES.map((s) => [s.id, 'pending'])),
  detail: '',
  startedAt: Date.now(),
  elapsedSec: 0,
});

const SmartOlt = () => {
  const [loading, setLoading] = useState(true);
  const [onus, setOnus] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [zones, setZones] = useState([]);
  const [onuTypes, setOnuTypes] = useState([]);
  const [defaults, setDefaults] = useState(null);

  const [modalOnu, setModalOnu] = useState(null);
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceResults, setServiceResults] = useState([]);
  const [searchingServices, setSearchingServices] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [authProgress, setAuthProgress] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(null);
  const [partial, setPartial] = useState(null);

  const searchTimer = useRef(null);
  const progressTimer = useRef(null);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const startProgressClock = () => {
    clearProgressTimer();
    progressTimer.current = setInterval(() => {
      setAuthProgress((prev) =>
        prev ? { ...prev, elapsedSec: Math.floor((Date.now() - prev.startedAt) / 1000) } : prev
      );
    }, 500);
  };

  useEffect(() => () => clearProgressTimer(), []);

  const loadOnus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await http.get('/smartolt/unconfigured-onus');
      setOnus(Array.isArray(response?.data?.data) ? response.data.data : []);
      setFetchedAt(response?.data?.fetched_at || null);
    } catch (error) {
      setOnus([]);
      setLoadError(errorMessage(error, 'Failed to load unconfigured ONUs from SmartOLT.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const response = await http.get('/smartolt/options');
      setZones(Array.isArray(response?.data?.zones) ? response.data.zones : []);
      setOnuTypes(Array.isArray(response?.data?.onu_types) ? response.data.onu_types : []);
      setDefaults(response?.data?.defaults || null);
    } catch (error) {
      // The list still renders; the modal will surface the problem on open.
      setZones([]);
      setOnuTypes([]);
    }
  }, []);

  useEffect(() => {
    loadOnus();
    loadOptions();
  }, [loadOnus, loadOptions]);

  const filteredOnus = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return onus;
    return onus.filter((onu) =>
      [onu.sn, onu.pon, onu.board, onu.port, onu.detected_onu_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [onus, search]);

  const zoneOptions = useMemo(
    () => zones.map((zone) => ({ value: zone.name, label: zone.name })),
    [zones]
  );

  const typeOptions = useMemo(
    () =>
      onuTypes.map((type) => ({
        value: type.name,
        label: type.supports_routing ? type.name : `${type.name} (bridging only)`,
        supportsRouting: type.supports_routing,
      })),
    [onuTypes]
  );

  const openModal = (onu) => {
    setModalOnu(onu);
    setServiceQuery('');
    setServiceResults([]);
    setSelectedService(null);
    setSelectedZone(null);
    setConfirmReplace(null);
    setPartial(null);
    setAuthProgress(null);
    clearProgressTimer();
    const suggested = onu.suggested_onu_type || defaults?.onu_type || null;
    setSelectedType(suggested ? { value: suggested, label: suggested } : null);
  };

  const closeModal = () => {
    if (authorizing) return;
    setModalOnu(null);
    setConfirmReplace(null);
    setPartial(null);
    setAuthProgress(null);
    clearProgressTimer();
  };

  const runServiceSearch = useCallback(async (query) => {
    if (query.trim().length < 2) {
      setServiceResults([]);
      return;
    }
    setSearchingServices(true);
    try {
      const response = await http.get('/smartolt/search-services', { params: { q: query } });
      setServiceResults(Array.isArray(response?.data?.data) ? response.data.data : []);
    } catch (error) {
      setServiceResults([]);
      showError(errorMessage(error, 'Customer search failed.'));
    } finally {
      setSearchingServices(false);
    }
  }, []);

  const onServiceQueryChange = (value) => {
    setServiceQuery(value);
    setSelectedService(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runServiceSearch(value), 350);
  };

  const pickService = (service) => {
    setSelectedService(service);
    setConfirmReplace(null);
    if (service.suggested_zone) {
      setSelectedZone({ value: service.suggested_zone, label: service.suggested_zone });
    }
    // Pre-warn from the local link so the user sees Replace before the first POST.
    if (service.existing_onu_sn) {
      setConfirmReplace({
        message: `${service.pppoe_username || 'This service'} already has ONU ${service.existing_onu_sn}`
          + (service.existing_onu_pon ? ` on PON ${service.existing_onu_pon}` : '')
          + ' linked. Replacing will delete the old ONU on SmartOLT and authorize this new one.',
        existing: {
          sn: service.existing_onu_sn,
          board: service.existing_onu_pon?.split('/')?.[0] || null,
          port: service.existing_onu_pon?.split('/')?.[1] || null,
        },
      });
    }
  };

  const markStage = (stageId, status, detail = '') => {
    setAuthProgress((prev) => {
      const base = prev || initialProgress();
      return {
        ...base,
        active: status === 'running' ? stageId : status === 'done' || status === 'error' ? stageId : base.active,
        detail: detail || base.detail,
        statuses: { ...base.statuses, [stageId]: status },
      };
    });
  };

  const submitAuthorize = async (replaceExisting = false) => {
    if (!modalOnu || !selectedService || !selectedZone || !selectedType) return;

    setAuthorizing(true);
    setAuthProgress(initialProgress());
    startProgressClock();

    const baseBody = {
      sn: modalOnu.sn,
      service_id: selectedService.service_id,
      zone: selectedZone.value,
      onu_type: selectedType.value,
      board: modalOnu.board,
      port: modalOnu.port,
      replace_existing: replaceExisting ? 1 : 0,
    };

    let lastMessage = `ONU ${modalOnu.sn} authorized.`;

    try {
      for (const stage of AUTH_STAGES) {
        markStage(stage.id, 'running', `${stage.label}…`);

        try {
          const response = await http.post(
            '/smartolt/authorize-onu',
            { ...baseBody, stage: stage.id },
            { timeout: 180000, validateStatus: (s) => (s >= 200 && s < 300) || s === 207 }
          );

          const data = response?.data || {};

          if (data?.requires_confirmation === 'replace_existing' || response?.status === 409) {
            markStage(stage.id, 'pending');
            setConfirmReplace({
              message:
                data?.message ||
                'This customer already has an ONU authorized. Confirm replace to continue.',
              existing: data?.existing_onu || null,
            });
            setAuthProgress(null);
            clearProgressTimer();
            return;
          }

          if (data?.needs_pppoe_retry) {
            markStage(stage.id, 'error', data.message || 'PPPoE failed');
            setPartial({
              message: data.message,
              externalId: data.external_id,
              serviceId: data.service_id,
            });
            setOnus((current) => current.filter((row) => row.sn !== modalOnu.sn));
            clearProgressTimer();
            return;
          }

          if (response.status === 207 && stage.id === 'resync') {
            // ONU is authorized; resync warning only
            markStage(stage.id, 'done', data.message || 'Resync warning');
            lastMessage = data.message || lastMessage;
            break;
          }

          if (data?.success === false) {
            throw Object.assign(new Error(data?.message || 'Stage failed'), {
              response: { data, status: response.status },
            });
          }

          markStage(stage.id, 'done', data.message || stage.label);
          if (data.message) lastMessage = data.message;
        } catch (error) {
          const data = error?.response?.data;

          if (data?.requires_confirmation === 'replace_existing' || error?.response?.status === 409) {
            markStage(stage.id, 'pending');
            setConfirmReplace({
              message:
                data?.message ||
                'This customer already has an ONU authorized. Confirm replace to continue.',
              existing: data?.existing_onu || null,
            });
            setAuthProgress(null);
            clearProgressTimer();
            return;
          }

          if (data?.needs_pppoe_retry) {
            markStage(stage.id, 'error', data.message || 'PPPoE failed');
            setPartial({
              message: data.message,
              externalId: data.external_id,
              serviceId: data.service_id,
            });
            setOnus((current) => current.filter((row) => row.sn !== modalOnu.sn));
            clearProgressTimer();
            return;
          }

          markStage(stage.id, 'error', errorMessage(error, `${stage.label} failed.`));
          showError(errorMessage(error, `${stage.label} failed.`));
          clearProgressTimer();
          return;
        }
      }

      showSuccess(lastMessage);
      setOnus((current) => current.filter((row) => row.sn !== modalOnu.sn));
      clearProgressTimer();
      setAuthProgress(null);
      setModalOnu(null);
      setConfirmReplace(null);
      setPartial(null);
    } finally {
      setAuthorizing(false);
    }
  };

  const retryPppoe = async () => {
    if (!partial) return;
    setAuthorizing(true);
    setAuthProgress({
      ...initialProgress(),
      statuses: {
        authorize: 'done',
        pppoe: 'pending',
        config: 'pending',
        resync: 'pending',
      },
    });
    startProgressClock();

    const followUp = ['pppoe', 'config', 'resync'];
    let lastMessage = 'PPPoE credentials applied.';

    try {
      for (const stageId of followUp) {
        const stage = AUTH_STAGES.find((s) => s.id === stageId);
        markStage(stageId, 'running', `${stage.label}…`);

        const response = await http.post(
          '/smartolt/authorize-onu',
          {
            sn: partial.externalId,
            service_id: partial.serviceId,
            stage: stageId,
          },
          { timeout: 180000, validateStatus: (s) => (s >= 200 && s < 300) || s === 207 }
        );

        const data = response?.data || {};
        if (data?.needs_pppoe_retry || (data?.success === false && stageId === 'pppoe')) {
          markStage(stageId, 'error', data.message || 'PPPoE failed');
          setPartial((prev) => ({ ...prev, message: data.message || prev.message }));
          showError(data.message || 'Retry failed.');
          clearProgressTimer();
          return;
        }

        markStage(stageId, 'done', data.message || stage.label);
        if (data.message) lastMessage = data.message;
      }

      showSuccess(lastMessage);
      clearProgressTimer();
      setAuthProgress(null);
      setModalOnu(null);
      setPartial(null);
    } catch (error) {
      const data = error?.response?.data;
      if (data?.needs_pppoe_retry) {
        setPartial((prev) => ({ ...prev, message: data.message || prev?.message }));
      }
      showError(errorMessage(error, 'Retry failed.'));
      clearProgressTimer();
    } finally {
      setAuthorizing(false);
    }
  };

  const runSync = async (forceFresh = false) => {
    if (forceFresh) {
      const ok = window.confirm(
        'Pull a LIVE full ONU list from SmartOLT?\n\n'
          + 'SmartOLT allows only 15 get_all_onus_details calls per hour. '
          + 'Prefer the normal link (uses cache) unless you really need a refresh.'
      );
      if (!ok) return;
    }
    setSyncing(true);
    try {
      const response = await http.post(
        '/smartolt/sync-onus',
        { fresh: forceFresh ? 1 : 0 },
        { timeout: 180000 }
      );
      const remaining = response?.data?.all_onus_budget_remaining;
      showSuccess(
        (response?.data?.message || 'Linked services to their ONUs.')
          + (remaining != null ? ` Dump budget left this hour: ${remaining}.` : '')
      );
    } catch (error) {
      showError(errorMessage(error, 'Sync failed.'));
    } finally {
      setSyncing(false);
    }
  };

  const canSubmit =
    Boolean(selectedService?.has_credentials) &&
    Boolean(selectedZone) &&
    Boolean(selectedType) &&
    !authorizing;

  return (
    <React.Fragment>
      <Head title="SmartOLT" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>SmartOLT</BlockTitle>
              </BlockHeadContent>
            <BlockHeadContent>
              <ul className="nk-block-tools g-3">
                <li>
                  <Button color="light" outline onClick={() => runSync(false)} disabled={syncing}>
                    {syncing ? <Spinner size="sm" /> : <Icon name="link-h" />}
                    <span>Link existing ONUs</span>
                  </Button>
                </li>
                <li>
                  <Button
                    color="light"
                    outline
                    title="Uses a rare get_all_onus_details call (15/hour max)"
                    onClick={() => runSync(true)}
                    disabled={syncing}
                  >
                    <Icon name="reload-alt" />
                    <span>Force dump</span>
                  </Button>
                </li>
                <li>
                  <Button color="primary" onClick={loadOnus} disabled={loading}>
                    <Icon name="reload" />
                    <span>Refresh</span>
                  </Button>
                </li>
              </ul>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <PreviewCard>
            {loadError && (
              <Alert color="danger" className="alert-icon">
                <Icon name="alert-circle" /> {loadError}
              </Alert>
            )}

            <div className="d-flex flex-wrap justify-between align-center g-2 mb-3">
              <div className="form-control-wrap" style={{ minWidth: 240, maxWidth: 360, flex: 1 }}>
                <div className="form-icon form-icon-left">
                  <Icon name="search" />
                </div>
                <input
                  type="search"
                  className="form-control"
                  placeholder="Filter by serial, board or port…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="text-soft">
                {`${filteredOnus.length} waiting`}
                {fetchedAt ? ` · checked ${fetchedAt}` : ''}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : filteredOnus.length === 0 ? (
              <div className="text-center py-5 text-soft">
                No ONUs are waiting for authorization. An ONU appears here once it is powered up
                and connected to the fibre — press Refresh after plugging one in.
              </div>
            ) : (
              <div className="table-responsive">
                <Table className="nk-tb-list nk-tb-ulist">
                  <thead>
                    <tr className="nk-tb-item nk-tb-head">
                      <th className="nk-tb-col">Serial (SN)</th>
                      <th className="nk-tb-col">PON</th>
                      <th className="nk-tb-col tb-col-md">Detected model</th>
                      <th className="nk-tb-col tb-col-lg">OLT</th>
                      <th className="nk-tb-col nk-tb-col-tools text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOnus.map((onu) => (
                      <tr key={onu.sn} className="nk-tb-item">
                        <td className="nk-tb-col">
                          <span className="tb-lead">{onu.sn}</span>
                        </td>
                        <td className="nk-tb-col">
                          {onu.pon ? (
                            <Badge color="primary" className="badge-dim">
                              {onu.pon}
                            </Badge>
                          ) : (
                            <span className="text-soft">unknown</span>
                          )}
                        </td>
                        <td className="nk-tb-col tb-col-md">
                          {onu.detected_onu_type || <span className="text-soft">not reported</span>}
                          {!onu.onu_type_recognised && (
                            <div className="text-soft small">
                              will use {onu.suggested_onu_type}
                            </div>
                          )}
                        </td>
                        <td className="nk-tb-col tb-col-lg text-soft">
                          {onu.olt_name || onu.olt_id}
                        </td>
                        <td className="nk-tb-col nk-tb-col-tools text-end">
                          <Button color="success" size="sm" onClick={() => openModal(onu)}>
                            Authorize
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </PreviewCard>
        </Block>

        <Modal isOpen={Boolean(modalOnu)} toggle={closeModal} size="lg">
          <ModalHeader toggle={closeModal}>
            Authorize {modalOnu?.sn}
            {modalOnu?.pon ? ` — PON ${modalOnu.pon}` : ''}
          </ModalHeader>
          <ModalBody>
            {authProgress && (
              <div className="border rounded p-3 mb-3 bg-lighter">
                <div className="d-flex justify-between align-center mb-2">
                  <strong>Progress</strong>
                  <span className="text-soft small">
                    {authorizing ? `Working… ${authProgress.elapsedSec}s` : 'Done'}
                  </span>
                </div>
                <ul className="list-unstyled mb-0">
                  {AUTH_STAGES.map((stage) => {
                    const status = authProgress.statuses[stage.id] || 'pending';
                    const isActive = authProgress.active === stage.id && status === 'running';
                    let icon = 'circle';
                    let color = 'text-soft';
                    if (status === 'done') {
                      icon = 'check-circle';
                      color = 'text-success';
                    } else if (status === 'error') {
                      icon = 'cross-circle';
                      color = 'text-danger';
                    } else if (status === 'running') {
                      icon = 'loader';
                      color = 'text-primary';
                    }
                    return (
                      <li key={stage.id} className={`d-flex align-items-center g-2 py-1 ${color}`}>
                        {status === 'running' ? (
                          <Spinner size="sm" className="me-2" />
                        ) : (
                          <Icon name={icon} className="me-2" />
                        )}
                        <span className={isActive ? 'fw-bold' : ''}>{stage.label}</span>
                        {status === 'done' && <span className="ms-auto small text-success">Done</span>}
                        {status === 'error' && <span className="ms-auto small text-danger">Failed</span>}
                        {status === 'pending' && <span className="ms-auto small text-soft">Waiting</span>}
                      </li>
                    );
                  })}
                </ul>
                {authProgress.detail ? (
                  <div className="text-soft small mt-2">{authProgress.detail}</div>
                ) : null}
                <div className="text-soft small mt-1">
                  This can take a minute or two — leave this window open.
                </div>
              </div>
            )}

            {partial ? (
              <>
                <Alert color="warning" className="alert-icon">
                  <Icon name="alert-circle" /> {partial.message}
                </Alert>
                <div className="d-flex justify-end g-2">
                  <Button color="light" onClick={closeModal} disabled={authorizing}>
                    Close
                  </Button>
                  <Button color="primary" onClick={retryPppoe} disabled={authorizing}>
                    {authorizing ? <Spinner size="sm" /> : <Icon name="reload" />}
                    <span>Retry PPPoE</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Customer</label>
                  <div className="form-control-wrap">
                    <div className="form-icon form-icon-left">
                      <Icon name="search" />
                    </div>
                    <input
                      type="search"
                      className="form-control"
                      autoFocus
                      placeholder="Search by name, phone or PPPoE username…"
                      value={serviceQuery}
                      onChange={(event) => onServiceQueryChange(event.target.value)}
                    />
                  </div>
                  {searchingServices && (
                    <div className="text-soft small mt-1">Searching…</div>
                  )}
                </div>

                {serviceResults.length > 0 && !selectedService && (
                  <div className="border rounded mb-3" style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {serviceResults.map((service) => (
                      <button
                        key={service.service_id}
                        type="button"
                        className="d-block w-100 text-start border-0 bg-transparent p-2 border-bottom"
                        onClick={() => pickService(service)}
                      >
                        <span className="fw-bold">{service.customer_name}</span>
                        <span className="text-soft"> · {service.phone_number || 'no phone'}</span>
                        <div className="text-soft small">
                          {service.pppoe_username || 'no PPPoE username'}
                          {service.plan_title ? ` · ${service.plan_title}` : ''}
                          {service.address ? ` · ${service.address}` : ''}
                        </div>
                        {service.existing_onu_sn && (
                          <Badge color="warning" className="badge-dim mt-1">
                            already has ONU {service.existing_onu_sn}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedService && (
                  <div className="bg-lighter rounded p-3 mb-3">
                    <div className="d-flex justify-between align-center">
                      <div>
                        <span className="fw-bold">{selectedService.customer_name}</span>
                        <span className="text-soft"> · {selectedService.phone_number}</span>
                        <div className="text-soft small">
                          PPPoE <code>{selectedService.pppoe_username}</code>
                          {selectedService.plan_title ? ` · ${selectedService.plan_title}` : ''}
                          {selectedService.status_label ? ` · ${selectedService.status_label}` : ''}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        color="light"
                        onClick={() => {
                          setSelectedService(null);
                          setConfirmReplace(null);
                        }}
                      >
                        Change
                      </Button>
                    </div>
                    {!selectedService.has_credentials && (
                      <Alert color="danger" className="alert-icon mt-2 mb-0">
                        <Icon name="alert-circle" /> This service has no PPPoE username/password.
                        Add the service credentials first —{' '}
                        <Link to={`/admin/customers/view/${selectedService.customer_id}`}>
                          open customer
                        </Link>
                        .
                      </Alert>
                    )}
                  </div>
                )}

                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">Zone</label>
                      <RSelect
                        options={zoneOptions}
                        value={selectedZone}
                        placeholder="Select zone"
                        onChange={(option) => setSelectedZone(option)}
                      />
                      <small className="text-soft">
                        {selectedService?.suggested_zone
                          ? `Matched from address: ${selectedService.suggested_zone}`
                          : 'Pick the area where the ONU is installed.'}
                      </small>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">ONU model</label>
                      <RSelect
                        options={typeOptions}
                        value={selectedType}
                        placeholder="Select ONU type"
                        onChange={(option) => setSelectedType(option)}
                      />
                      {selectedType && selectedType.supportsRouting === false && (
                        <small className="text-danger">
                          This model is bridging-only and cannot be authorized in Routing mode.
                        </small>
                      )}
                    </div>
                  </div>
                </div>

                {defaults && (
                  <div className="text-soft small mb-3">
                    Applied automatically — OLT {defaults.olt_id}, VLAN {defaults.vlan},{' '}
                    {defaults.onu_mode} mode, {defaults.upload_speed_profile}/
                    {defaults.download_speed_profile} profiles, Mgmt DHCP on VLAN{' '}
                    {defaults.mgmt_ip_vlan}, TR-069 enabled.
                  </div>
                )}

                {confirmReplace && (
                  <Alert color="warning" className="alert-icon">
                    <Icon name="alert-circle" /> {confirmReplace.message}
                  </Alert>
                )}

                <div className="d-flex justify-end g-2">
                  <Button color="light" onClick={closeModal} disabled={authorizing}>
                    Cancel
                  </Button>
                  {confirmReplace ? (
                    <Button color="danger" onClick={() => submitAuthorize(true)} disabled={!canSubmit}>
                      {authorizing ? <Spinner size="sm" /> : null}
                      <span>
                        {authorizing
                          ? AUTH_STAGES.find((s) => s.id === authProgress?.active)?.label || 'Working…'
                          : 'Replace old ONU and authorize'}
                      </span>
                    </Button>
                  ) : (
                    <Button color="success" onClick={() => submitAuthorize(false)} disabled={!canSubmit}>
                      {authorizing ? <Spinner size="sm" /> : null}
                      <span>
                        {authorizing
                          ? AUTH_STAGES.find((s) => s.id === authProgress?.active)?.label || 'Working…'
                          : 'Authorize ONU'}
                      </span>
                    </Button>
                  )}
                </div>
              </>
            )}
          </ModalBody>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default SmartOlt;
