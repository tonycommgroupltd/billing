import React, { useRef, useState } from "react";
import { Alert, Badge, Card, CardBody, Collapse, Spinner } from "reactstrap";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import AiDiagnosticAPI from "../../helpers/AiDiagnosticAPI";

const EXAMPLES = [
  "How many prepaid customers do we have, and how many of those are active?",
  "What is the RADIUS status right now?",
  "What is our SMS balance?",
  "How is hotspot looking today?",
  "Any OLT issues?",
  "Bro check 0712848481 — customer says no internet",
  "How many active customers have bill date behind today?",
];

const prettyJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const IntelligencePanel = ({ trace = [], toolsUsed = [], iterations, open, onToggle }) => {
  if (!trace.length && !toolsUsed.length) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center"
        onClick={onToggle}
      >
        <Icon name="activity" className="me-1" />
        {open ? "Hide intelligence" : "View intelligence"}
        {toolsUsed.length > 0 && (
          <Badge color="dark" pill className="ms-2">
            {toolsUsed.length} tool{toolsUsed.length === 1 ? "" : "s"}
          </Badge>
        )}
      </button>

      <Collapse isOpen={open}>
        <div
          className="mt-2 p-3 rounded border"
          style={{ background: "#0f172a", color: "#e2e8f0", fontSize: 12.5 }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong style={{ color: "#93c5fd" }}>Smart intelligence trail</strong>
            {iterations ? <span className="text-muted">Rounds: {iterations}</span> : null}
          </div>

          {trace.map((step, index) => (
            <div
              key={`${step.step || index}-${step.title || step.tool || "step"}`}
              className="mb-3 pb-3"
              style={{ borderBottom: index === trace.length - 1 ? "none" : "1px solid #1e293b" }}
            >
              <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                <Badge
                  color={
                    step.type === "answer"
                      ? "success"
                      : step.type === "tool"
                        ? step.ok === false
                          ? "danger"
                          : "info"
                        : "secondary"
                  }
                  pill
                >
                  {step.type || "step"}
                </Badge>
                <strong>{step.title || step.tool || `Step ${index + 1}`}</strong>
                {typeof step.elapsed_ms === "number" && (
                  <span className="text-muted">{step.elapsed_ms} ms</span>
                )}
              </div>

              {step.detail && <div className="mb-2" style={{ color: "#cbd5e1" }}>{step.detail}</div>}
              {step.purpose && (
                <div className="mb-2">
                  <span className="text-muted">Purpose: </span>
                  {step.purpose}
                </div>
              )}

              {step.python && (
                <div className="mb-2">
                  <div className="text-muted mb-1">Python script</div>
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      background: "#020617",
                      borderRadius: 6,
                      overflow: "auto",
                      maxHeight: 220,
                      color: "#86efac",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {step.python}
                  </pre>
                </div>
              )}

              {(step.output || step.args) && (
                <div>
                  <div className="text-muted mb-1">{step.python ? "Python output / RESULT" : "Output"}</div>
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      background: "#020617",
                      borderRadius: 6,
                      overflow: "auto",
                      maxHeight: 220,
                      color: "#fde68a",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {prettyJson(step.output || step.args)}
                  </pre>
                </div>
              )}
            </div>
          ))}

          {!trace.length && toolsUsed.length > 0 && (
            <div>
              {toolsUsed.map((tool) => (
                <Badge color="light" pill className="text-dark me-1" key={tool}>
                  {tool}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
};

const AiDiagnostics = () => {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openIntel, setOpenIntel] = useState({});
  const inputRef = useRef(null);

  const ask = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;

    setError("");
    setLoading(true);
    setQuestion("");
    const nextMessages = [
      ...messages,
      { role: "user", text },
      {
        role: "assistant",
        text: "Looking that up…",
        pending: true,
        toolsUsed: [],
        trace: [
          {
            step: 1,
            type: "plan",
            title: "Working",
            detail: "Agent is choosing tools / writing research Python. Full log unlocks when the answer arrives — click View intelligence after.",
          },
        ],
      },
    ];
    setMessages(nextMessages);
    const pendingIndex = nextMessages.length - 1;
    setOpenIntel((current) => ({ ...current, [pendingIndex]: true }));

    try {
      const history = nextMessages
        .filter((message) => !message.pending)
        .slice(-6, -1)
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.text || "").slice(0, 900),
        }));
      const response = await AiDiagnosticAPI.ask(text, { history });
      const data = response.data || {};
      setMessages((current) =>
        current.map((message, index) =>
          index === pendingIndex
            ? {
                role: "assistant",
                text: data.answer || "Hmm, I didn't get anything back. Try again?",
                toolsUsed: data.tools_used || [],
                trace: data.trace || [],
                iterations: data.iterations,
                generatedAt: data.generated_at,
                pending: false,
              }
            : message
        )
      );
      setOpenIntel((current) => ({ ...current, [pendingIndex]: true }));
    } catch (requestError) {
      const status = requestError.response?.status;
      const validation =
        requestError.response?.data?.errors?.question?.[0] ||
        requestError.response?.data?.message;
      const timedOut =
        requestError.code === "ECONNABORTED" ||
        /timeout/i.test(String(requestError.message || ""));
      if (status === 429 || requestError.response?.data?.rate_limited) {
        setError(validation || "Groq is rate-limited right now. Wait a few seconds and try again.");
      } else if (timedOut) {
        setError("The assistant took too long (server timeout). Try again — research questions can take up to ~2 minutes.");
      } else {
        setError(validation || "Couldn't reach the assistant right now.");
      }
      setMessages((current) => current.filter((message, index) => index !== pendingIndex));
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <>
      <Head title="AI buddy" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>AI buddy</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        {error && <Alert color="danger">{error}</Alert>}

        <div className="mb-4">
          {messages.length === 0 && (
            <Card className="border-dashed">
              <CardBody className="text-center py-5">
                <Icon name="chat-circle-fill" className="text-primary" style={{ fontSize: 38 }} />
                <h5 className="mt-3">Ask me anything in the app</h5>
                <p className="text-soft mb-3">Customers, tickets, SMS, logs, hotspot, billing — just talk.</p>
                <div className="d-flex flex-wrap justify-content-center gap-2">
                  {EXAMPLES.map((example) => (
                    <Button
                      key={example}
                      color="light"
                      size="sm"
                      onClick={() => {
                        setQuestion(example);
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`d-flex mb-3 ${message.role === "user" ? "justify-content-end" : "justify-content-start"}`}
            >
              <Card
                className={message.role === "user" ? "bg-primary text-white" : ""}
                style={{ maxWidth: message.role === "user" ? "75%" : "96%", width: message.role === "assistant" ? "100%" : "auto" }}
              >
                <CardBody className="py-3 px-4">
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                    {message.pending ? (
                      <span className="d-inline-flex align-items-center text-soft">
                        <Spinner size="sm" color="primary" className="me-2" />
                        {message.text}
                      </span>
                    ) : (
                      message.text
                    )}
                  </div>

                  {message.role === "assistant" && (
                    <IntelligencePanel
                      trace={message.trace || []}
                      toolsUsed={message.toolsUsed || []}
                      iterations={message.iterations}
                      open={!!openIntel[index]}
                      onToggle={() =>
                        setOpenIntel((current) => ({
                          ...current,
                          [index]: !current[index],
                        }))
                      }
                    />
                  )}
                </CardBody>
              </Card>
            </div>
          ))}
        </div>

        <Card>
          <CardBody>
            <form onSubmit={ask}>
              <label className="form-label fw-medium" htmlFor="ai-diagnostic-question">
                Message
              </label>
              <textarea
                id="ai-diagnostic-question"
                ref={inputRef}
                className="form-control"
                rows="3"
                maxLength="2000"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask anything — tickets, SMS, logs, customers, hotspot…"
                disabled={loading}
              />
              <div className="d-flex justify-content-between align-items-center mt-3">
                <small className="text-soft">{question.length}/2000</small>
                <Button color="primary" type="submit" disabled={loading || !question.trim()}>
                  {loading ? <Spinner size="sm" className="me-1" /> : <Icon name="send" className="me-1" />}
                  Send
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </Content>
    </>
  );
};

export default AiDiagnostics;
