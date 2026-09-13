import { http } from "./http";

const AiDiagnosticAPI = {
  ask(question, { history = [] } = {}) {
    return http.post(
      "/ai-diagnostics/ask",
      {
        question,
        ...(history.length ? { history } : {}),
      },
      { timeout: 120000 }
    );
  },
};

export default AiDiagnosticAPI;
