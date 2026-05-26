import { envFlag } from './constants';

export async function fetchWebResearch(topic: string, signal?: AbortSignal) {
  if (!envFlag('MANIMATE_WEBSEARCH', true)) return null;
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: `${topic} key facts overview reliable educational sources`,
      search_depth: process.env.TAVILY_SEARCH_DEPTH || 'advanced',
      max_results: Math.max(1, Number(process.env.TAVILY_MAX_RESULTS || 5)),
      include_answer: true,
      include_raw_content: false,
    }),
    signal,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const parts: string[] = [];
  if (typeof data.answer === 'string') parts.push(`Answer: ${data.answer.slice(0, 1000)}`);
  for (const [index, item] of (Array.isArray(data.results) ? data.results : []).entries()) {
    parts.push(`Source ${index + 1}: ${item.title || 'Untitled'}\nURL: ${item.url || ''}\nSnippet: ${String(item.content || '').slice(0, 700)}`);
  }
  return parts.join('\n\n').slice(0, 5000) || null;
}
