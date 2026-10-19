const { call } = require('../lib/api');

// How long a test in the Zap editor waits for the results: the editor stops a test step at 30
// seconds, and does not wait for a callback.
const SAMPLE_WAIT_S = 20;

// A search takes about half a minute, longer than Zapier waits for an action. So it is started
// with Zapier's callback URL as its webhook, and the step resumes when MeshArc posts that the
// results are in (an answer from MeshArc's cache posts at once).
const perform = async (z, bundle) => {
  const sample = Boolean(bundle.meta && bundle.meta.isLoadingSample);
  const body = { query: bundle.inputData.query, limit: Number(bundle.inputData.limit || 5) };
  if (bundle.inputData.country) body.country = String(bundle.inputData.country).toLowerCase();
  if (sample) {
    // A test in the Zap editor: wait for the results now, so the fields to map from are theirs.
    body.timeout = SAMPLE_WAIT_S;
  } else {
    body.timeout = 0;
    body.webhook = { url: z.generateCallbackUrl(), events: ['search.completed', 'search.failed'] };
  }
  const response = await call(z, 'POST', '/search', { body });
  if (sample) {
    if (!['queued', 'running'].includes(response.data.status)) return searchOutput(z, response.data);
    // Still searching: every field, so the editor still offers them all to map.
    return { searchId: response.data.id, query: bundle.inputData.query, resultCount: null, results: [],
      topUrl: null, topTitle: null };
  }
  return { id: response.data.id, status: response.data.status, query: bundle.inputData.query };
};

// MeshArc said the search ended: read the results themselves, with the connected key.
const performResume = async (z, bundle) => {
  const response = await call(z, 'GET', `/search/${encodeURIComponent(bundle.outputData.id)}`);
  return searchOutput(z, response.data);
};

// The step's output for a search that has ended, or the step fails saying why.
const searchOutput = (z, search) => {
  if (search.status === 'blocked') {
    throw new z.errors.Error('Every search engine refused this search; nothing was charged. Try again later.',
      'SearchRefused', 503);
  }
  if (search.status !== 'done') {
    throw new z.errors.Error(`The search ended ${search.status}: ${search.error || 'no results came back'}.`,
      'SearchFailed', 422);
  }
  const results = (search.data || []).map((hit) => ({
    position: hit.position,
    title: hit.title,
    url: hit.url,
    snippet: hit.snippet,
    engine: hit.engine,
  }));
  return {
    searchId: search.id,
    query: search.query,
    resultCount: results.length,
    results,
    topUrl: results.length ? results[0].url : null,
    topTitle: results.length ? results[0].title : null,
  };
};

module.exports = {
  key: 'search_web',
  noun: 'Search',
  display: {
    label: 'Search the Web',
    description: 'Searches the web and returns the results: title, URL and snippet.',
  },
  operation: {
    inputFields: [
      { key: 'query', label: 'Query', required: true, helpText: 'What to search for, as you would type it into a search engine.' },
      {
        key: 'limit',
        label: 'Max Results',
        type: 'integer',
        required: false,
        default: '5',
        helpText: 'How many results to return, from 1 to 10.',
      },
      {
        key: 'country',
        label: 'Country',
        required: false,
        helpText: 'A two-letter country code to search from, such as `us` or `de`. Leave it empty for the default.',
      },
    ],
    perform,
    performResume,
    sample: {
      searchId: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
      query: 'web scraping api',
      resultCount: 1,
      results: [
        {
          position: 1,
          title: 'MeshArc: the web crawler',
          url: 'https://mesharc.dev/',
          snippet: 'Search the web, scrape pages to clean markdown, and see what changed.',
          engine: 'google',
        },
      ],
      topUrl: 'https://mesharc.dev/',
      topTitle: 'MeshArc: the web crawler',
    },
    outputFields: [
      { key: 'query', label: 'Query' },
      { key: 'resultCount', label: 'Result Count', type: 'integer' },
      { key: 'topUrl', label: 'Top Result URL' },
      { key: 'topTitle', label: 'Top Result Title' },
      { key: 'results[]position', label: 'Results Position', type: 'integer' },
      { key: 'results[]title', label: 'Results Title' },
      { key: 'results[]url', label: 'Results URL' },
      { key: 'results[]snippet', label: 'Results Snippet' },
      { key: 'results[]engine', label: 'Results Engine' },
      { key: 'searchId', label: 'Search ID' },
    ],
  },
};
