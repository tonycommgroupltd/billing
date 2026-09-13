// ============================================
// TCOM API — AI Chat Routes
// ============================================
// POST /api/chat/send          — Send message to AI bot
// GET  /api/chat/history       — Get chat history
// DELETE /api/chat/history      — Clear chat history
//
// Uses Google Gemini AI with ISP-specific system prompt
// Falls back to keyword matching if Gemini fails
// ============================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { localPool } = require('../db');
const { authMiddleware } = require('../auth');

// All chat routes require auth
router.use(authMiddleware);

// Gemini config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
function getGeminiUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
}

// ISP-specific system prompt
const SYSTEM_PROMPT = `You are TCOM Assistant, the AI support bot for TonyComm Group Ltd — an Internet Service Provider (ISP) based in Nakuru, Kenya.

Company Details:
- Name: TonyComm Group Ltd (branded as TCOM)
- Location: Nakuru, Kenya
- Phone: +254 110 345 166
- Email: tonycommgroupltd@gmail.com
- Website: www.tonycommgroupltd.com
- M-Pesa Paybill: 4129711

What you can help with:
1. Internet connectivity issues (slow speed, no connection, intermittent)
2. Billing & payments (M-Pesa Paybill 4129711, invoice questions, balance)
3. Account management (profile, password changes)
4. Service plans and upgrades
5. Router/WiFi troubleshooting (restart router, change password)
6. Installation queries
7. General ISP questions

Guidelines:
- Be helpful, professional, and concise
- ONLY answer questions related to TCOM internet service, billing, accounts, routers, WiFi, and support
- If the question is off-topic (general knowledge, politics, coding, jokes, other companies, etc.), politely decline and list what you CAN help with
- Never answer unrelated questions even if you know the answer
- For technical issues, give step-by-step troubleshooting
- Always suggest contacting support (+254 110 345 166) for complex hardware issues
- If you don't know something ISP-related, be honest and direct them to human support
- Keep responses under 150 words unless detailed steps are needed
- Use friendly but professional tone
- For billing issues, remind them: M-Pesa Paybill 4129711
- Never share internal system details or credentials
- Never help with hacking, illegal access, or bypassing security
- If they want to raise a formal complaint, suggest creating a support ticket in the app`;

// --------------------------------------------------
// POST /api/chat/send — Send message, get AI response
// --------------------------------------------------
router.post('/send', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userMsg = message.trim();

    // Save user message
    await localPool.query(
      'INSERT INTO chat_messages (customer_id, role, content) VALUES (?, ?, ?)',
      [customerId, 'user', userMsg]
    );

    // Get recent chat history for context (last 10 messages)
    const [history] = await localPool.query(
      `SELECT role, content FROM chat_messages 
       WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`,
      [customerId]
    );
    const recentHistory = history.reverse();

    // Try Gemini first, fall back to keyword matching
    let botResponse;
    let provider = 'fallback';

    if (GEMINI_API_KEY) {
      try {
        botResponse = await getGeminiResponse(userMsg, recentHistory);
        provider = 'gemini';
      } catch (err) {
        const reason = err.response?.data?.error?.message || err.message;
        console.warn('Gemini failed, using fallback:', reason);
        botResponse = getFallbackResponse(userMsg);
        provider = 'fallback';
      }
    } else {
      botResponse = getFallbackResponse(userMsg);
    }

    // Save bot response
    await localPool.query(
      'INSERT INTO chat_messages (customer_id, role, content) VALUES (?, ?, ?)',
      [customerId, 'assistant', botResponse]
    );

    res.json({
      success: true,
      response: botResponse,
      provider,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// --------------------------------------------------
// GET /api/chat/history — Get chat history
// --------------------------------------------------
router.get('/history', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const [messages] = await localPool.query(
      `SELECT id, role, content, created_at FROM chat_messages
       WHERE customer_id = ? ORDER BY created_at ASC LIMIT ?`,
      [customerId, limit]
    );

    res.json({ messages });
  } catch (err) {
    console.error('Chat history error:', err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

// --------------------------------------------------
// DELETE /api/chat/history — Clear chat history
// --------------------------------------------------
router.delete('/history', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    await localPool.query('DELETE FROM chat_messages WHERE customer_id = ?', [customerId]);
    res.json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    console.error('Clear chat error:', err);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// ==================================================
// Gemini AI
// ==================================================
async function getGeminiResponse(userMessage, history) {
  // Build conversation
  const contents = [];

  // System instruction via first user turn
  contents.push({
    role: 'user',
    parts: [{ text: SYSTEM_PROMPT + '\n\nRespond to the customer below.' }],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Understood. I am TCOM Assistant ready to help TonyComm customers. How can I assist you today?' }],
  });

  // Add recent history
  for (const msg of history.slice(0, -1)) { // exclude current message (already in history)
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  // Current message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  const response = await axios.post(getGeminiUrl(), {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 300,
      topP: 0.9,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  }, { timeout: 15000 });

  const candidate = response.data?.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error('Empty Gemini response');
  }

  return candidate.content.parts[0].text.trim();
}

// ==================================================
// Fallback — keyword-based responses
// ==================================================

const OFF_TOPIC_REPLY =
  "I'm TCOM's internet support assistant, so I can only help with TCOM service topics — connection issues, billing, M-Pesa payments, WiFi/router help, plans, and support tickets.\n\nFor anything else, please contact our team at +254 110 345 166 or use the quick options below.";

/** True when the message is clearly not about TCOM / ISP support */
function isClearlyOffTopic(msg) {
  const onTopic =
    /internet|wifi|wi-fi|router|bill|pay|mpesa|m-?pesa|invoice|balance|tcom|tonycomm|plan|upgrade|package|install|fibre|fiber|connect|speed|slow|offline|password|account|profile|ticket|support|paybill|mbps|data\s*usage|pppoe|onu|outage|no\s*connection|buffering/i;
  if (onTopic.test(msg)) return false;

  return /capital of|president|prime minister|who won|weather|forecast|recipe|cook|football|soccer|basketball|bitcoin|crypto|stock market|write (me )?(a )?(python|code|script|essay|poem)|tell me a joke|sing a song|translate |homework|solve this math|what is \d+[\+\-\*\/]|movie|actor|actress|country in africa|history of(?! tcom)/i.test(
    msg
  );
}

function getFallbackResponse(message) {
  const msg = message.toLowerCase().trim();

  // Greetings
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|habari|sasa|niaje)\b/i.test(msg)) {
    return "Hello! 👋 Welcome to TCOM Support. I'm here to help with internet connectivity, billing, account issues, or anything else. What can I assist you with today?";
  }

  // Unsafe / abusive requests (check before generic "wifi" match)
  if (/hack|crack|steal|illegal|bypass|break into|unauthorized/i.test(msg)) {
    return "I can't help with hacking or unauthorized access. For legitimate WiFi or account help, ask about changing your WiFi password in the app (Profile → Change Password) or call +254 110 345 166.";
  }

  // Clearly off-topic (general knowledge, etc.)
  if (isClearlyOffTopic(msg)) {
    return OFF_TOPIC_REPLY;
  }

  // Slow internet
  if (/slow|speed|lag|buffering|mbps/i.test(msg)) {
    return "I understand slow internet is frustrating. Try these steps:\n\n1️⃣ Restart your router (unplug for 30 seconds)\n2️⃣ Check if other devices have the same issue\n3️⃣ Move closer to your router if on WiFi\n4️⃣ Run a speed test from the Connection tab\n\nIf it persists, call us at +254 110 345 166 and we'll check your line.";
  }

  // No internet
  if (/no internet|can'?t connect|not working|disconnected|offline/i.test(msg)) {
    return "Let's get you back online:\n\n1️⃣ Check your router lights — is the power light on?\n2️⃣ Restart your router (unplug 30 secs)\n3️⃣ Check if your bill is current (Invoices tab)\n4️⃣ Check Connection Status in the app\n\nIf the issue continues, call +254 110 345 166 for immediate help.";
  }

  // WiFi password (not generic "password" alone — avoids false positives)
  if (/wifi|wi-fi|ssid|router.*password|change.*password|wifi.*password/i.test(msg)) {
    return "To change your WiFi password:\n\n1️⃣ Go to Profile → Change Password\n2️⃣ Select the 'WiFi' tab\n3️⃣ Enter your new password (at least 8 characters)\n4️⃣ Tap 'Update Password'\n\nYour devices will need to reconnect with the new password.";
  }

  // App login password
  if (/app password|login password|sign.?in password/i.test(msg)) {
    return "To change your app login password:\n\n1️⃣ Go to Profile → Change Password\n2️⃣ Use the app password section\n3️⃣ Enter current and new password\n\nOr use Forgot Password on the login screen if you can't sign in.";
  }

  // Billing / payment
  if (/bill|pay|mpesa|m-pesa|invoice|balance|paybill|amount|owing/i.test(msg)) {
    return "For payments:\n\n📱 **M-Pesa Paybill: 4129711**\n💰 Use your phone number as the Account Number\n\nYou can also:\n- View invoices in the Invoices tab\n- Download statements from the Statement tab\n- Check your balance on the Dashboard\n\nNeed help with a specific payment? Call +254 110 345 166.";
  }

  // Plans / upgrade
  if (/plan|upgrade|package|speed.*plan|bandwidth|data\s*plan/i.test(msg)) {
    return "We offer various internet plans to suit your needs. To upgrade or change your plan:\n\n1️⃣ Call +254 110 345 166\n2️⃣ Or WhatsApp us at the same number\n3️⃣ Our team will help find the best plan for you\n\nYou can view your current plan in the Profile tab.";
  }

  // Installation
  if (/install|setup|new connection|fibre|fiber|connect.*house/i.test(msg)) {
    return "For new installations:\n\n1️⃣ Call +254 110 345 166 to check coverage\n2️⃣ Our team will schedule a site survey\n3️⃣ Installation is typically done within 48 hours\n\nVisit www.tonycommgroupltd.com for more details.";
  }

  // Account
  if (/account|profile|details|name|phone|address/i.test(msg)) {
    return "You can view your account info in the Profile tab. This includes your personal details, all services, and billing info.\n\nFor account changes, contact support at +254 110 345 166.";
  }

  // Thanks
  if (/thank|asante|appreciated/i.test(msg)) {
    return "You're welcome! 😊 If you need anything else, feel free to ask anytime. Happy browsing!";
  }

  // Complaint / ticket
  if (/complain|ticket|issue|problem|report|escalat/i.test(msg)) {
    return "I'm sorry to hear that! You can raise a support ticket directly from the Tickets tab in the app. Our team will review it and respond as soon as possible.\n\nFor urgent issues, call +254 110 345 166.";
  }

  // Default — stay on-brand (don't guess answers for unknown topics)
  return OFF_TOPIC_REPLY;
}

module.exports = router;
