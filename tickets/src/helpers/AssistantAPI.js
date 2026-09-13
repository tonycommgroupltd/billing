import { http } from './http';

const AssistantAPI = {
  /** Whether server has OpenAI key configured */
  getStatus: async () => {
    const response = await http.get('/assistant/status');
    const data = response?.data ?? {};
    return {
      configured: Boolean(data.openai_configured),
      model: data.model || 'gpt-4o-mini',
      hint: data.hint || null,
    };
  },

  /**
   * Send message to OpenAI via server. Returns { reply, intents }.
   * @param {{ message: string, context?: object, history?: Array<{role, text}> }} payload
   */
  chat: async (payload) => {
    const response = await http.post('/assistant/chat', payload);
    const data = response?.data ?? {};
    return {
      success: data.success !== false,
      mode: data.mode || 'openai',
      reply: data.reply || '',
      intents: Array.isArray(data.intents) ? data.intents : [],
      error: data.error || null,
      code: data.code || null,
      hint: data.hint || null,
    };
  },
};

export default AssistantAPI;
