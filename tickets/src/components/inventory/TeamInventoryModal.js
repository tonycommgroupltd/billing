import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, Badge, Spinner } from 'reactstrap';
import { fetchDisbursementTeamContext } from '../../utils/disbursementTeamContext';
import { formatDropCableBalance } from '../../utils/inventoryCable';

function formatItemPending(it) {
  if (it.rollMeters) {
    return formatDropCableBalance(it.remaining, it.rollMeters);
  }
  const n = parseInt(it.remaining, 10);
  return Number.isFinite(n) ? `×${n}${it.unit ? ` ${it.unit}` : ''}` : '—';
}

const TeamInventoryModal = ({ isOpen, toggle, user }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [context, setContext] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setContext(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchDisbursementTeamContext(user.id);
      setContext(data);
    } catch {
      setError('Could not load team inventory.');
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen && user?.id) {
      load();
    }
  }, [isOpen, user?.id, load]);

  const sourceLabel =
    context?.source === 'roster'
      ? 'Daily roster'
      : context?.source === 'manual'
        ? 'Manual schedule'
        : 'Individual';

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg" scrollable>
      <ModalHeader toggle={toggle}>
        Team inventory
        {user?.name ? ` — ${user.name}` : ''}
      </ModalHeader>
      <ModalBody style={{ maxHeight: '70vh' }}>
        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : error ? (
          <div className="text-danger">{error}</div>
        ) : !context ? (
          <div className="text-muted">Select a user first.</div>
        ) : (
          <>
            <div
              className="mb-3 p-3 rounded"
              style={{ background: '#f5f6fa', border: '1px solid #e5e9f2' }}
            >
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
                {context.teamTitle ? (
                  <strong style={{ fontSize: '0.95rem' }}>{context.teamTitle}</strong>
                ) : (
                  <span className="text-muted">No team group for today</span>
                )}
                <Badge color="light" style={{ fontSize: '0.68rem', color: '#526484' }}>
                  {sourceLabel}
                </Badge>
                <Badge color="light" style={{ fontSize: '0.68rem', color: '#526484' }}>
                  {context.lookupDate}
                </Badge>
              </div>
              <div className="mt-2 text-soft" style={{ fontSize: '0.78rem' }}>
                {context.withPending} with pending stock · {context.withoutPending} with nothing
                pending
              </div>
            </div>

            {context.members.map((member) => (
              <div
                key={member.id}
                className="mb-3 p-3 rounded"
                style={{
                  border: member.isSelected ? '2px solid #6576ff' : '1px solid #e5e9f2',
                  background: member.isSelected ? '#f8f9ff' : '#fff',
                }}
              >
                <div className="d-flex align-items-center mb-2 flex-wrap" style={{ gap: 6 }}>
                  <strong style={{ fontSize: '0.88rem' }}>{member.name}</strong>
                  {member.isSelected && (
                    <Badge color="primary" style={{ fontSize: '0.62rem' }}>
                      Assigning to
                    </Badge>
                  )}
                  {!member.hasPending && (
                    <Badge color="light" style={{ fontSize: '0.62rem', color: '#8094ae' }}>
                      Nothing pending
                    </Badge>
                  )}
                  {member.hasPending && (
                    <>
                      {member.pendingRouters.length > 0 && (
                        <Badge color="warning" style={{ fontSize: '0.62rem' }}>
                          {member.pendingRouters.length} router
                          {member.pendingRouters.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {member.pendingItems.length > 0 && (
                        <Badge color="info" style={{ fontSize: '0.62rem' }}>
                          {member.pendingItems.length} item
                          {member.pendingItems.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </>
                  )}
                </div>

                {member.hasPending ? (
                  <>
                    {member.pendingRouters.length > 0 && (
                      <div className="mb-2">
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: '#f59e0b',
                            textTransform: 'uppercase',
                          }}
                        >
                          Routers
                        </span>
                        <div className="d-flex flex-wrap mt-1" style={{ gap: 4 }}>
                          {member.pendingRouters.map((r) => (
                            <span
                              key={r.id || r.item_name}
                              style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                borderRadius: 4,
                                padding: '2px 8px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                fontFamily: 'monospace',
                              }}
                            >
                              {r.item_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {member.pendingItems.length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: '#6576ff',
                            textTransform: 'uppercase',
                          }}
                        >
                          Items / cable
                        </span>
                        {member.pendingItems.map((it) => (
                          <div
                            key={it.roll_number || it.id || it.name}
                            className="d-flex justify-content-between mt-1"
                            style={{ fontSize: '0.78rem' }}
                          >
                            <span>
                              {it.roll_number ? (
                                <strong style={{ fontFamily: 'monospace' }}>{it.roll_number}</strong>
                              ) : (
                                it.name
                              )}
                              {it.roll_number && it.cable_type && (
                                <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                                  {' '}
                                  · {it.cable_type}
                                </span>
                              )}
                            </span>
                            <span className="text-muted">{formatItemPending(it)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    No routers or items currently assigned to this person.
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </ModalBody>
    </Modal>
  );
};

export default TeamInventoryModal;
