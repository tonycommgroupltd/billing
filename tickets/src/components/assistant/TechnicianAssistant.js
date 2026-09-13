import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ROLES } from '../../config/roles';
import AssistantAPI from '../../helpers/AssistantAPI';
import { parseAssistantMessage } from '../../services/technicianAssistant/parseIntent';
import { executeAssistantAction } from '../../services/technicianAssistant/executeAction';

const ASSISTANT_ROLES = [
  ROLES.Technician,
  ROLES.Engineer,
  ROLES.Admin,
  ROLES.SuperAdmin,
  ROLES.Manager,
];

const QUICK_ACTIONS = [
  { label: 'Help', message: 'help' },
  { label: 'My tickets', message: 'my tickets' },
  { label: 'Mark resolved', message: 'mark resolved' },
  { label: 'Close ticket', message: 'close this ticket' },
];

function canUseAssistant(user) {
  const roles = user?.all_roles || [];
  return roles.some((r) => ASSISTANT_ROLES.includes(r));
}

const TechnicianAssistant = () => {
  const user = useSelector((state) => state.auth?.currentUser);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiMode, setAiMode] = useState(null); // null | 'openai' | 'rules'
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hi — I can change ticket status, add notes, open tickets, and list your work. Say "help" to see commands.',
    },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const enabled = process.env.REACT_APP_ENABLE_TECHNICIAN_ASSISTANT !== 'false';
  const show = enabled && canUseAssistant(user);

  const context = useMemo(() => {
    const ticketId = params.id ? parseInt(params.id, 10) : null;
    return { ticketId, pathname: location.pathname };
  }, [params.id, location.pathname]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    AssistantAPI.getStatus()
      .then((s) => setAiMode(s.configured ? 'openai' : 'rules'))
      .catch(() => setAiMode('rules'));
  }, [open]);

  if (!show) return null;

  const pushMessage = (role, text) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const runCommand = async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || busy) return;

    pushMessage('user', trimmed);
    setInput('');
    setBusy(true);

    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));

    try {
      let usedAi = false;
      if (aiMode !== 'rules') {
        try {
          const ai = await AssistantAPI.chat({
            message: trimmed,
            context: { ticket_id: context.ticketId },
            history,
          });
          if (ai.success && (ai.intents?.length || ai.reply)) {
            usedAi = true;
            const intents = ai.intents || [];
            if (intents.length === 0) {
              pushMessage('assistant', ai.reply || 'Done.');
            } else {
              if (ai.reply) pushMessage('assistant', ai.reply);
              for (const intent of intents) {
                const result = await executeAssistantAction(intent, { user, navigate });
                pushMessage(
                  'assistant',
                  result.message || (result.success ? 'Done.' : 'Something went wrong.')
                );
              }
            }
          } else if (ai.code === 'OPENAI_NOT_CONFIGURED') {
            setAiMode('rules');
          } else if (ai.error) {
            pushMessage('assistant', ai.error + (ai.hint ? `\n\n${ai.hint}` : ''));
            usedAi = true;
          }
        } catch {
          setAiMode('rules');
        }
      }

      if (!usedAi) {
        const intent = parseAssistantMessage(trimmed, context);
        const result = await executeAssistantAction(intent, { user, navigate });
        pushMessage('assistant', result.message || (result.success ? 'Done.' : 'Something went wrong.'));
      }
    } catch (e) {
      pushMessage('assistant', e?.response?.data?.error || e?.message || 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    runCommand(input);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Smart assistant — automate tickets"
        aria-label="Open technician assistant"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1050,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #6576ff 0%, #8b5cf6 100%)',
          color: '#fff',
          boxShadow: '0 4px 20px rgba(101, 118, 255, 0.45)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.35rem',
        }}
      >
        <em className="icon ni ni-spark" />
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 92,
            right: 24,
            zIndex: 1050,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(480px, calc(100vh - 120px))',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(16, 24, 40, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #e5e9f2',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #6576ff 0%, #8b5cf6 100%)',
              color: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                TCOM Assistant
                {aiMode === 'openai' && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: '0.62rem',
                      background: 'rgba(255,255,255,0.25)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    AI
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                {context.ticketId ? `On ticket #${context.ticketId}` : 'Automate your work'}
                {aiMode === 'rules' && ' · basic mode (add OpenAI key on server)'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                width: 28,
                height: 28,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              background: '#f8f9fc',
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '88%',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: '0.82rem',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? '#6576ff' : '#fff',
                    color: m.role === 'user' ? '#fff' : '#364a63',
                    border: m.role === 'user' ? 'none' : '1px solid #e5e9f2',
                  }}
                >
                  {m.text.replace(/\*\*(.*?)\*\*/g, '$1')}
                </div>
              </div>
            ))}
            {busy && (
              <div style={{ fontSize: '0.78rem', color: '#8094ae', padding: '4px 8px' }}>
                Working…
              </div>
            )}
          </div>

          <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e9f2', background: '#fff' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={busy}
                  onClick={() => runCommand(q.message)}
                  style={{
                    fontSize: '0.68rem',
                    padding: '4px 8px',
                    borderRadius: 20,
                    border: '1px solid #dbe4ff',
                    background: '#f0f3ff',
                    color: '#6576ff',
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                className="form-control"
                placeholder='e.g. "change ticket 45 to resolved"'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
                style={{ fontSize: '0.85rem' }}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !input.trim()}>
                Go
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default TechnicianAssistant;
