const crypto = require('crypto');

// Production. MESHARC_API_URL is only for running the tests against a local MeshArc.
const API = (process.env.MESHARC_API_URL || 'https://api.mesharc.dev/api/v1').replace(/\/$/, '');

/** One call to the MeshArc API; the key is added by the app's beforeRequest. */
const call = async (z, method, path, { body, params, skipThrowForStatus } = {}) => {
  const response = await z.request({
    method,
    url: `${API}${path}`,
    params,
    body,
    skipThrowForStatus,
  });
  return response;
};

/** `+759` or `− 748`, as the change feed writes them, as a number. */
const wordCount = (value) => {
  const digits = String(value === undefined || value === null ? '' : value).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
};

/** One changed page of a change record, as a flat item. `id` is unique per page per run. */
const changeItem = (projectId, change, entry) => ({
  id: `${change.id}:${entry.url}`,
  projectId,
  runId: change.runId || null,
  previousRunId: change.prevRunId || null,
  changeId: change.id || null,
  changedAt: change.createdAt || null,
  kind: entry.kind,
  url: entry.url,
  path: entry.path || null,
  title: entry.section || '',
  wordsAdded: wordCount(entry.added),
  wordsRemoved: wordCount(entry.removed),
  wordsBefore: entry.wordsBefore === undefined ? null : entry.wordsBefore,
  wordsAfter: entry.wordsAfter === undefined ? null : entry.wordsAfter,
});

/** The kinds of change asked for; added, modified and removed when none are. */
const wantedKinds = (inputData) => {
  const kinds = [].concat(inputData.kinds || []).filter(Boolean);
  return kinds.length ? kinds : ['added', 'modified', 'removed'];
};

/** The changed pages one run of a project found, of the kinds asked for. */
const runChangeItems = async (z, projectId, runId, kinds) => {
  const response = await call(z, 'GET', `/projects/${encodeURIComponent(projectId)}/changes`, {
    params: runId ? { run_id: runId } : undefined,
  });
  const change = response.data.change;
  if (!change) return [];
  return (change.feed || [])
    .filter((entry) => kinds.includes(String(entry.kind)))
    .map((entry) => changeItem(projectId, change, entry));
};

/** Is `header` (X-MeshArc-Signature, `sha256=<hex>`) the HMAC of `body` under `secret`? */
const validSignature = (secret, body, header) => {
  if (!secret || !header || typeof body !== 'string') return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`);
  const given = Buffer.from(String(header));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

/** A header from Zapier's raw request, whatever case or `Http-` prefix it carries. */
const rawHeader = (rawRequest, name) => {
  const headers = (rawRequest && rawRequest.headers) || {};
  const want = name.toLowerCase();
  const key = Object.keys(headers).find((k) => {
    const lower = k.toLowerCase();
    return lower === want || lower === `http-${want}`;
  });
  return key ? headers[key] : undefined;
};

/** The fields of a page most Zaps want, under plain names. */
const simplifyPage = (row) => {
  const head = row.head || {};
  const status = row.status;
  return {
    url: row.url,
    title: row.title || head.title || '',
    markdown: row.markdown || '',
    httpStatus: row.httpStatus !== undefined ? row.httpStatus : typeof status === 'number' ? status : null,
    pageStatus: row.pageStatus !== undefined ? row.pageStatus : typeof status === 'string' ? status : null,
    words: row.words === undefined ? null : row.words,
    language: row.language === undefined ? null : row.language,
    credits: row.credits === undefined ? null : row.credits,
    crawledAt: row.crawledAt === undefined ? null : row.crawledAt,
  };
};

module.exports = {
  API,
  call,
  changeItem,
  rawHeader,
  runChangeItems,
  simplifyPage,
  validSignature,
  wantedKinds,
  wordCount,
};
