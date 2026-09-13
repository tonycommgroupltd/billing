import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Col, Row, Spinner } from 'reactstrap';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Icon } from '../../components/Component';
import { http } from '../../helpers';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const COLORS = {
  down: '#09c2de',
  downSoft: 'rgba(9, 194, 222, 0.16)',
  up: '#f4bd0e',
  upSoft: 'rgba(244, 189, 14, 0.16)',
  grid: 'rgba(148, 163, 184, 0.14)',
  tick: '#8094ae',
};

const LIVE_MAX_POINTS = 48;
const POLL_MS = 5000;

const formatBps = (bits) => {
  const n = Number(bits) || 0;
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
};

const formatTick = (iso, withDate = false) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!withDate) return `${hh}:${mm}`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  return `${dd} ${mon} ${hh}:${mm}`;
};

/**
 * Full-tab MikroTik PPPoE live rates + 24h history.
 * Only polls while `active` so other customer tabs stay light.
 */
const CustomerPppoeStatsCard = ({ customerId, serviceId, active = true }) => {
  const [mode, setMode] = useState('live');
  const [live, setLive] = useState(null);
  const [liveSeries, setLiveSeries] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!customerId || !active) return undefined;

    let cancelled = false;
    setBootLoading(true);
    setError(null);

    const params = serviceId ? { service_id: serviceId } : {};

    const pullLive = async (isFirst = false) => {
      try {
        const res = await http.get(`/customers/${customerId}/pppoe-bandwidth/live`, {
          params,
          timeout: 20000,
        });
        if (cancelled || !aliveRef.current) return;
        const data = res?.data || {};
        setLive(data);
        setError(null);
        if (data.online) {
          const point = {
            t: data.sampled_at || new Date().toISOString(),
            download: Number(data.download_bps) || 0,
            upload: Number(data.upload_bps) || 0,
          };
          setLiveSeries((prev) => [...prev, point].slice(-LIVE_MAX_POINTS));
        }
      } catch (err) {
        if (cancelled || !aliveRef.current) return;
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Could not read PPPoE rates.';
        setError(msg);
        if (err?.response?.data) {
          setLive({ online: false, ...(err.response.data || {}) });
        }
      } finally {
        if (!cancelled && aliveRef.current && isFirst) setBootLoading(false);
      }
    };

    const pullHistory = async () => {
      try {
        const res = await http.get(`/customers/${customerId}/pppoe-bandwidth/history`, {
          params: { ...params, range: '24h' },
          timeout: 20000,
        });
        if (cancelled || !aliveRef.current) return;
        setHistory(Array.isArray(res?.data?.points) ? res.data.points : []);
      } catch {
        if (!cancelled && aliveRef.current) setHistory([]);
      } finally {
        if (!cancelled && aliveRef.current) setHistoryLoaded(true);
      }
    };

    pullLive(true);
    pullHistory();

    const timer = setInterval(() => {
      if (document.hidden) return;
      pullLive(false);
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [customerId, serviceId, active]);

  const chartPoints = mode === 'live' ? liveSeries : history;
  const withDateTicks = mode === '24h';

  const chartData = useMemo(() => {
    const labels = chartPoints.map((p) => formatTick(p.t, withDateTicks));
    return {
      labels,
      datasets: [
        {
          label: 'Download',
          data: chartPoints.map((p) => Number(p.download) || 0),
          borderColor: COLORS.down,
          backgroundColor: COLORS.downSoft,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2.5,
        },
        {
          label: 'Upload',
          data: chartPoints.map((p) => Number(p.upload) || 0),
          borderColor: COLORS.up,
          backgroundColor: COLORS.upSoft,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2.5,
        },
      ],
    };
  }, [chartPoints, withDateTicks]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            color: COLORS.tick,
            font: { size: 12, weight: '600' },
            padding: 16,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatBps(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid, drawBorder: false },
          ticks: {
            color: COLORS.tick,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: mode === '24h' ? 10 : 8,
            font: { size: 11 },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.grid, drawBorder: false },
          ticks: {
            color: COLORS.tick,
            font: { size: 11 },
            callback: (v) => formatBps(v),
            maxTicksLimit: 6,
          },
        },
      },
    }),
    [mode]
  );

  const online = Boolean(live?.online);
  const downBps = Number(live?.download_bps) || 0;
  const upBps = Number(live?.upload_bps) || 0;
  const emptyChart = chartPoints.length < 2;

  return (
    <div className="customer-pppoe-page">
      <div className="card-block customer-pppoe-hero-card">
        <div className="customer-pppoe-hero-top">
          <div>
            <div className="customer-pppoe-kicker">MikroTik PPPoE</div>
            <h5 className="customer-pppoe-heading mb-1">Live traffic</h5>
            <p className="customer-pppoe-sub text-soft mb-0">
              Real-time download and upload from the customer&apos;s NAS session.
              History keeps roughly the last 24 hours for online sessions.
            </p>
          </div>
          <div className="customer-pppoe-hero-actions">
            <Badge color={online ? 'success' : 'secondary'} pill className="customer-pppoe-status-badge">
              {bootLoading ? 'Checking…' : online ? 'Session online' : 'Session offline'}
            </Badge>
            <div className="customer-pppoe-stats-toggle">
              <button
                type="button"
                className={mode === 'live' ? 'is-active' : ''}
                onClick={() => setMode('live')}
              >
                Live
              </button>
              <button
                type="button"
                className={mode === '24h' ? 'is-active' : ''}
                onClick={() => setMode('24h')}
              >
                24 hours
              </button>
            </div>
          </div>
        </div>

        <Row className="g-3 customer-pppoe-kpi-row">
          <Col sm="6" lg="3">
            <div className="customer-pppoe-kpi">
              <span className="customer-pppoe-kpi-label">
                <span className="customer-pppoe-dot down" /> Download
              </span>
              <strong className="customer-pppoe-kpi-value">
                {bootLoading ? '—' : formatBps(downBps)}
              </strong>
              <span className="customer-pppoe-kpi-hint">to customer</span>
            </div>
          </Col>
          <Col sm="6" lg="3">
            <div className="customer-pppoe-kpi">
              <span className="customer-pppoe-kpi-label">
                <span className="customer-pppoe-dot up" /> Upload
              </span>
              <strong className="customer-pppoe-kpi-value">
                {bootLoading ? '—' : formatBps(upBps)}
              </strong>
              <span className="customer-pppoe-kpi-hint">from customer</span>
            </div>
          </Col>
          <Col sm="6" lg="3">
            <div className="customer-pppoe-kpi muted">
              <span className="customer-pppoe-kpi-label">
                <Icon name="user" /> PPPoE
              </span>
              <strong className="customer-pppoe-kpi-value small">
                {live?.username || '—'}
              </strong>
              <span className="customer-pppoe-kpi-hint">
                {live?.address || (online ? 'IP pending' : 'not connected')}
              </span>
            </div>
          </Col>
          <Col sm="6" lg="3">
            <div className="customer-pppoe-kpi muted">
              <span className="customer-pppoe-kpi-label">
                <Icon name="server" /> Router
              </span>
              <strong className="customer-pppoe-kpi-value small">
                {live?.router || '—'}
              </strong>
              <span className="customer-pppoe-kpi-hint">
                {live?.interface || live?.uptime || 'NAS path'}
              </span>
            </div>
          </Col>
        </Row>

        <div className="customer-pppoe-chart-shell">
          <div className="customer-pppoe-chart-head">
            <span>{mode === 'live' ? 'Live rate graph' : 'Last 24 hours'}</span>
            <span className="text-soft">
              {mode === 'live' ? 'Refreshes every 5s while this tab is open' : 'Sampled every few minutes while online'}
            </span>
          </div>
          <div className="customer-pppoe-chart-canvas">
            {bootLoading && mode === 'live' ? (
              <div className="customer-pppoe-stats-empty">
                <Spinner size="sm" /> Reading MikroTik…
              </div>
            ) : emptyChart ? (
              <div className="customer-pppoe-stats-empty">
                {mode === 'live'
                  ? online
                    ? 'Collecting live samples…'
                    : error || live?.message || 'Session is offline — no live graph yet.'
                  : historyLoaded
                    ? 'No 24h samples yet. History builds while the session is online.'
                    : 'Loading history…'}
              </div>
            ) : (
              <Line data={chartData} options={chartOptions} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerPppoeStatsCard;
