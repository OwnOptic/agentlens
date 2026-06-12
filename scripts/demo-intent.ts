import { analyzeConversation, aggregateAgentSignals, parseTranscriptContent, type TranscriptMessage } from '../lib/analysis/intent';

const samples: { label: string; msgs: TranscriptMessage[] }[] = [
  { label: 'gratitude + resolved', msgs: [
    { role: 'user', text: 'how do I reset my password?' },
    { role: 'bot', text: 'Go to Settings > Security > Reset.' },
    { role: 'user', text: 'perfect, that worked. thank you so much!' },
  ] },
  { label: 'escalation', msgs: [
    { role: 'user', text: 'this isn\'t helping at all' },
    { role: 'bot', text: 'I can try again...' },
    { role: 'user', text: 'no, I want to talk to a human representative' },
  ] },
  { label: 'frustration + abandoned', msgs: [
    { role: 'user', text: 'the report is broken' },
    { role: 'bot', text: 'Have you tried refreshing?' },
    { role: 'user', text: 'this is useless and a complete waste of time' },
  ] },
  { label: 'neutral / unresolved', msgs: [
    { role: 'user', text: 'what are your opening hours?' },
    { role: 'bot', text: 'We are open 9-5.' },
  ] },
];

console.log('=== Per-conversation signals (lexicon classifier) ===');
for (const s of samples) {
  const sig = analyzeConversation(s.msgs);
  console.log(`\n${s.label}:`);
  console.log(`  gratitude=${sig.hadGratitude} resolved=${sig.resolved} escalated=${sig.escalated} frustrated=${sig.frustrated} abandoned=${sig.abandoned} sentiment=${sig.sentiment}`);
}

const agg = aggregateAgentSignals('bot-demo', samples.map((s) => analyzeConversation(s.msgs)));
console.log('\n=== Aggregated agent KPIs ===');
console.log(`  conversations: ${agg.conversations}`);
console.log(`  resolutionRate: ${agg.resolutionRate}%  | gratitudeRate: ${agg.gratitudeRate}%`);
console.log(`  escalationRate: ${agg.escalationRate}% | frustrationRate: ${agg.frustrationRate}%`);
console.log(`  abandonmentRate: ${agg.abandonmentRate}% | avgSentiment: ${agg.avgSentiment} | CSAT proxy: ${agg.csatProxy}/100`);

// transcript parser sanity
const parsed = parseTranscriptContent(JSON.stringify({ activities: [
  { type: 'message', from: { role: 'user' }, text: 'thanks, solved!' },
  { type: 'message', from: { role: 'bot' }, text: 'glad to help' },
] }));
console.log('\n=== Transcript parser ===');
console.log('  parsed messages:', parsed.length, JSON.stringify(parsed));
