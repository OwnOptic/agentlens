/**
 * Conversation intent & sentiment extraction.
 *
 * Analyzes Copilot Studio conversation transcripts for governance-relevant signals:
 *   - gratitude   ("thanks", "thank you", "that helped")
 *   - resolution  ("solved", "that worked", "perfect")
 *   - escalation  ("talk to a human", "speak to an agent", "representative")
 *   - frustration ("useless", "not working", "this is ridiculous")
 *   - abandonment (user goes silent after an unresolved exchange)
 *
 * Two classifiers:
 *   1. LLM (Azure OpenAI) - PRIMARY. Infers signals from MEANING, not keywords:
 *      handles paraphrases, implicit success/failure, sarcasm, and any language.
 *   2. Lexicon - fast, free, deterministic FALLBACK when Azure OpenAI isn't configured.
 *
 * PII-SAFE: this module reads message TEXT in-memory only and emits COUNTS.
 * Callers must never persist raw transcript text - only the aggregated signals.
 * (LLM classification sends text to the tenant's OWN Azure OpenAI resource.)
 */

import { azureChat, getAzureConfig } from '@/lib/ai/azureOpenAI';

export interface TranscriptMessage {
  role: 'user' | 'bot' | 'agent' | 'system';
  text: string;
}

export interface ConversationSignals {
  hadGratitude: boolean;
  resolved: boolean;
  escalated: boolean;
  frustrated: boolean;
  abandoned: boolean;
  userTurns: number;
  sentiment: number;     // -1 (very negative) .. 1 (very positive)
  classifier: 'llm' | 'lexicon';
}

export interface AgentKpiSignals {
  botId: string;
  conversations: number;
  resolutionRate: number;   // resolved / conversations
  escalationRate: number;   // escalated / conversations
  frustrationRate: number;  // frustrated / conversations
  gratitudeRate: number;    // hadGratitude / conversations
  abandonmentRate: number;  // abandoned / conversations
  avgSentiment: number;     // mean sentiment -1..1
  csatProxy: number;        // 0-100, derived from sentiment/gratitude/resolution minus frustration/escalation
  classifier: 'llm' | 'lexicon' | 'mixed';
}

// ---- Lexicons (lowercased, matched as substrings/word-ish) -------------------
const GRATITUDE = ['thank you', 'thanks', 'thank u', 'thx', 'that helped', 'helpful', 'appreciate it', 'much appreciated', 'great help', 'merci', 'danke'];
const RESOLUTION = ['solved', 'resolved', 'that worked', 'it worked', 'perfect', 'exactly what i needed', 'all set', 'fixed', 'that did it', 'got it working', "that's it"];
const ESCALATION = ['talk to a human', 'speak to a human', 'speak to an agent', 'talk to an agent', 'real person', 'representative', 'human agent', 'transfer me', 'live agent', 'speak to someone', 'connect me to', 'escalate'];
const FRUSTRATION = ['useless', 'not working', "doesn't work", 'this is ridiculous', 'terrible', 'frustrated', 'frustrating', 'waste of time', 'stupid', 'awful', 'annoying', 'hate this', 'makes no sense', 'still not'];

function matchesAny(text: string, lexicon: string[]): boolean {
  const t = text.toLowerCase();
  return lexicon.some((phrase) => t.includes(phrase));
}

/** Analyze a single conversation's messages into signals. */
export function analyzeConversation(messages: TranscriptMessage[]): ConversationSignals {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const userText = userMsgs.map((m) => m.text);

  const hadGratitude = userText.some((t) => matchesAny(t, GRATITUDE));
  const resolved = userText.some((t) => matchesAny(t, RESOLUTION)) || hadGratitude;
  const escalated = userText.some((t) => matchesAny(t, ESCALATION));
  const frustrated = userText.some((t) => matchesAny(t, FRUSTRATION));

  // Abandonment heuristic: last message is from the user, expresses frustration or a question,
  // and the bot/agent never followed (or the conversation ended unresolved with frustration).
  const last = messages[messages.length - 1];
  const abandoned = Boolean(
    !resolved &&
      userMsgs.length > 0 &&
      (frustrated || (last && last.role === 'user')),
  );

  // crude lexicon sentiment: gratitude/resolution positive, frustration negative
  const sentiment = (hadGratitude || resolved ? 0.5 : 0) - (frustrated ? 0.7 : 0) - (escalated ? 0.3 : 0);

  return {
    hadGratitude,
    resolved,
    escalated,
    frustrated,
    abandoned,
    userTurns: userMsgs.length,
    sentiment: Math.max(-1, Math.min(1, sentiment)),
    classifier: 'lexicon',
  };
}

// ---------------------------------------------------------------------------
// LLM classifier (Azure OpenAI) - PRIMARY. Infers meaning, not keywords.
// ---------------------------------------------------------------------------
const CLASSIFY_SYSTEM = `You are a conversation analyst for AI agent governance. Read ONE conversation (user + bot turns) and classify it. Infer from MEANING - not keywords - and handle paraphrases, implicit signals, sarcasm, and ANY language.
Return STRICT JSON only, no prose:
{"resolved":boolean,"escalated":boolean,"frustrated":boolean,"gratitude":boolean,"abandoned":boolean,"sentiment":number}
- resolved: the user's need was actually met (explicit or implicit success).
- escalated: the user wanted/was routed to a human, agent, representative, or transfer.
- frustrated: the user expressed frustration, anger, or dissatisfaction.
- gratitude: the user expressed thanks or appreciation.
- abandoned: the conversation ended unresolved with the user disengaging.
- sentiment: overall user sentiment from -1 (very negative) to 1 (very positive).`;

/** Classify one conversation with Azure OpenAI. Returns null if not configured / fails. */
export async function classifyConversationLLM(messages: TranscriptMessage[]): Promise<ConversationSignals | null> {
  if (!getAzureConfig()) return null;
  const convo = messages.map((m) => `${m.role}: ${m.text}`).join('\n').slice(0, 6000);
  try {
    const raw = await azureChat(
      [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: convo },
      ],
      { temperature: 0, maxTokens: 150 },
    );
    const j = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return {
      hadGratitude: Boolean(j.gratitude),
      resolved: Boolean(j.resolved),
      escalated: Boolean(j.escalated),
      frustrated: Boolean(j.frustrated),
      abandoned: Boolean(j.abandoned),
      userTurns: messages.filter((m) => m.role === 'user').length,
      sentiment: typeof j.sentiment === 'number' ? Math.max(-1, Math.min(1, j.sentiment)) : 0,
      classifier: 'llm',
    };
  } catch {
    return null;
  }
}

/** Smart analyze: Azure OpenAI when available (meaning-based), else lexicon fallback. */
export async function analyzeConversationSmart(messages: TranscriptMessage[]): Promise<ConversationSignals> {
  const llm = await classifyConversationLLM(messages);
  return llm ?? analyzeConversation(messages);
}

/** Aggregate per-conversation signals for one agent into rates + a CSAT proxy. */
export function aggregateAgentSignals(
  botId: string,
  perConversation: ConversationSignals[],
): AgentKpiSignals {
  const n = perConversation.length;
  if (n === 0) {
    return { botId, conversations: 0, resolutionRate: 0, escalationRate: 0, frustrationRate: 0, gratitudeRate: 0, abandonmentRate: 0, avgSentiment: 0, csatProxy: 0, classifier: 'lexicon' };
  }
  const count = (pred: (c: ConversationSignals) => boolean) => perConversation.filter(pred).length;
  const resolved = count((c) => c.resolved);
  const escalated = count((c) => c.escalated);
  const frustrated = count((c) => c.frustrated);
  const gratitude = count((c) => c.hadGratitude);
  const abandoned = count((c) => c.abandoned);

  const rate = (x: number) => parseFloat(((x / n) * 100).toFixed(1));
  const avgSentiment = parseFloat((perConversation.reduce((s, c) => s + c.sentiment, 0) / n).toFixed(2));

  // CSAT proxy: sentiment + positive signals lift, negative signals drag. Clamped 0-100.
  const raw =
    50 +
    avgSentiment * 25 +
    (gratitude / n) * 20 +
    (resolved / n) * 20 -
    (frustrated / n) * 30 -
    (escalated / n) * 15 -
    (abandoned / n) * 15;
  const csatProxy = Math.max(0, Math.min(100, Math.round(raw)));

  const classifiers = new Set(perConversation.map((c) => c.classifier));
  const classifier = classifiers.size > 1 ? 'mixed' : (perConversation[0]?.classifier ?? 'lexicon');

  return {
    botId,
    conversations: n,
    resolutionRate: rate(resolved),
    escalationRate: rate(escalated),
    frustrationRate: rate(frustrated),
    gratitudeRate: rate(gratitude),
    abandonmentRate: rate(abandoned),
    avgSentiment,
    csatProxy,
    classifier,
  };
}

/**
 * Parse a Copilot Studio conversationtranscript `content` field (JSON string)
 * into normalized messages. Handles the common shapes; returns [] on unknown.
 */
export function parseTranscriptContent(content: string): TranscriptMessage[] {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  // Copilot Studio transcripts: { activities: [{ type, from: { role|name }, text }] }
  const activities =
    (json as { activities?: unknown[] }).activities ??
    (Array.isArray(json) ? (json as unknown[]) : []);
  const out: TranscriptMessage[] = [];
  for (const a of activities) {
    const act = a as { type?: string; text?: string; from?: { role?: string; name?: string } };
    if (act.type && act.type !== 'message') continue;
    if (typeof act.text !== 'string' || !act.text.trim()) continue;
    const fromRole = (act.from?.role ?? '').toLowerCase();
    const role: TranscriptMessage['role'] =
      fromRole === 'user' ? 'user' : fromRole === 'bot' ? 'bot' : fromRole === 'agent' ? 'agent' : 'user';
    out.push({ role, text: act.text });
  }
  return out;
}
