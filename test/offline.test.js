/* Offline: every call MeshArc would answer is mocked with nock, from the API's real shapes. */
const crypto = require('crypto');
const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { API } = require('../lib/api');

const appTester = zapier.createAppTester(App);
const api = () => nock(API.replace(/\/api\/v1$/, ''));
const P = '/api/v1';
const KEY = 'mesharc_test_key';
const auth = { apiKey: KEY };
const PROJECT = '58a019f9742f4d488a1d108d0c2f945f';
const SECRET = 'whsec_offline_test_secret';

const change = (id, runId, feed) => ({
  runs: [],
  change: { id, runId, prevRunId: 'prev-run', createdAt: '2026-10-19T05:00:00+00:00', feed },
});
const feed = [
  { kind: 'modified', url: 'https://s.test/a', path: '/a', section: 'A', added: '+12', removed: '− 3', wordsBefore: 100, wordsAfter: 109 },
  { kind: 'added', url: 'https://s.test/n', path: '/n', section: 'N', added: '+40', removed: '0' },
  { kind: 'fields', url: 'https://s.test/f', path: '/f', section: 'F', added: '0', removed: '0' },
];
const signed = (body, secret = SECRET) => ({
  content: body,
  headers: {
    'Http-X-Mesharc-Event': 'run.finished',
    'Http-X-Mesharc-Signature': `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`,
  },
});
const runMessage = (extra = {}) => ({
  id: 'delivery-1',
  event: 'run.finished',
  createdAt: '2026-10-19T05:00:00+00:00',
  data: { project: { id: PROJECT }, run: { id: 'run-2', status: 'done' }, baseline: false, ...extra },
});

afterEach(() => nock.cleanAll());

describe('authentication', () => {
  it('tests the key against /me and sends it as a bearer token', async () => {
    const scope = api().get(`${P}/me`).matchHeader('authorization', `Bearer ${KEY}`).reply(200, { id: 'o1', name: 'Acme' });
    const out = await appTester(App.authentication.test, { authData: auth });
    expect(out.name).toBe('Acme');
    expect(scope.isDone()).toBe(true);
  });

  it('says plainly when the key is refused', async () => {
    api().get(`${P}/me`).reply(401, { error: 'unauthorized', detail: 'invalid, expired or revoked API key' });
    await expect(appTester(App.authentication.test, { authData: { apiKey: 'bad' } })).rejects.toThrow(/did not accept the API key/);
  });
});

describe('project dropdown', () => {
  it('lists projects with the site when the name does not already say it', async () => {
    api().get(`${P}/projects`).reply(200, [
      { id: 'p1', name: 'Hacker News', host: 'news.ycombinator.com' },
      { id: 'p2', name: 'www.chiesi.com', host: 'www.chiesi.com' },
    ]);
    const out = await appTester(App.triggers.project.operation.perform, { authData: auth });
    expect(out).toEqual([
      { id: 'p1', name: 'Hacker News (news.ycombinator.com)' },
      { id: 'p2', name: 'www.chiesi.com' },
    ]);
  });
});

describe('New Changed Page', () => {
  const op = App.triggers.changed_page.operation;
  const bundle = (extra = {}) => ({
    authData: auth,
    inputData: { project: PROJECT },
    subscribeData: { id: 'sub-1', secret: SECRET },
    ...extra,
  });

  it('subscribes the Zap to the project for finished runs, labelled Zapier', async () => {
    let sent;
    api().post(`${P}/webhooks/subscriptions`, (b) => { sent = b; return true; })
      .reply(201, { subscription: { id: 'sub-1', secret: SECRET, projectId: PROJECT }, created: true });
    const out = await appTester(op.performSubscribe, bundle({ targetUrl: 'https://hooks.zapier.com/hooks/standard/1/abc/' }));
    expect(sent).toEqual({ projectId: PROJECT, url: 'https://hooks.zapier.com/hooks/standard/1/abc/', events: ['run.finished'], label: 'Zapier' });
    expect(out).toMatchObject({ id: 'sub-1', secret: SECRET });
  });

  it('unsubscribes, and a subscription already gone is not an error', async () => {
    api().delete(`${P}/webhooks/subscriptions/sub-1`).reply(204);
    await expect(appTester(op.performUnsubscribe, bundle())).resolves.toEqual({});
    api().delete(`${P}/webhooks/subscriptions/sub-1`).reply(404, { detail: 'subscription not found' });
    await expect(appTester(op.performUnsubscribe, bundle())).resolves.toEqual({});
  });

  it("turns a signed finished run into its changed pages, read from the API, default kinds", async () => {
    const body = JSON.stringify(runMessage());
    api().get(`${P}/projects/${PROJECT}/changes`).query({ run_id: 'run-2' }).reply(200, change('chg-2', 'run-2', feed));
    const out = await appTester(op.perform, bundle({ rawRequest: signed(body), cleanedRequest: JSON.parse(body) }));
    expect(out.map((i) => [i.kind, i.url, i.wordsAdded, i.wordsRemoved])).toEqual([
      ['modified', 'https://s.test/a', 12, 3],
      ['added', 'https://s.test/n', 40, 0],
    ]);
    expect(out[0]).toMatchObject({ id: 'chg-2:https://s.test/a', projectId: PROJECT, runId: 'run-2', previousRunId: 'prev-run',
      changeId: 'chg-2', changedAt: '2026-10-19T05:00:00+00:00', title: 'A', path: '/a', wordsBefore: 100, wordsAfter: 109 });
  });

  it('honours the kinds asked for', async () => {
    const body = JSON.stringify(runMessage());
    api().get(`${P}/projects/${PROJECT}/changes`).query({ run_id: 'run-2' }).reply(200, change('chg-2', 'run-2', feed));
    const out = await appTester(op.perform, bundle({ inputData: { project: PROJECT, kinds: ['fields'] },
      rawRequest: signed(body), cleanedRequest: JSON.parse(body) }));
    expect(out.map((i) => i.url)).toEqual(['https://s.test/f']);
  });

  it('ignores a message signed with another secret, or not signed at all, without calling the API', async () => {
    const body = JSON.stringify(runMessage());
    const forged = await appTester(op.perform, bundle({ rawRequest: signed(body, 'whsec_wrong'), cleanedRequest: JSON.parse(body) }));
    const unsigned = await appTester(op.perform, bundle({ rawRequest: { content: body, headers: {} }, cleanedRequest: JSON.parse(body) }));
    expect([forged, unsigned]).toEqual([[], []]);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('starts nothing for a baseline run, another project, or another event', async () => {
    for (const [message, event] of [
      [runMessage({ baseline: true }), 'run.finished'],
      [runMessage({ project: { id: 'another' } }), 'run.finished'],
      [{ ...runMessage(), event: 'site.failing' }, 'site.failing'],
    ]) {
      const body = JSON.stringify(message);
      const raw = signed(body);
      raw.headers['Http-X-Mesharc-Event'] = event;
      expect(await appTester(op.perform, bundle({ rawRequest: raw, cleanedRequest: JSON.parse(body) }))).toEqual([]);
    }
  });

  it('samples the latest run that changed something, skipping baselines and quiet runs', async () => {
    api().get(`${P}/projects/${PROJECT}/changes`).reply(200, {
      runs: [{ id: 'run-3', baseline: false }, { id: 'run-2', baseline: false }, { id: 'run-1', baseline: true }],
      change: null,
    });
    api().get(`${P}/projects/${PROJECT}/changes`).query({ run_id: 'run-3' }).reply(200, change('chg-3', 'run-3', []));
    api().get(`${P}/projects/${PROJECT}/changes`).query({ run_id: 'run-2' }).reply(200, change('chg-2', 'run-2', feed));
    const out = await appTester(op.performList, bundle());
    expect(out.map((i) => i.id)).toEqual(['chg-2:https://s.test/a', 'chg-2:https://s.test/n']);
    expect(Object.keys(out[0]).sort()).toEqual(Object.keys(op.sample).sort());
  });
});

describe('Scrape URL', () => {
  const op = App.creates.scrape_url.operation;

  it('starts a one-URL scrape that will call Zapier back', async () => {
    let sent;
    api().post(`${P}/scrape`, (b) => { sent = b; return true; }).reply(202, { id: 'b1', status: 'queued' });
    const out = await appTester(op.perform, { authData: auth, inputData: { url: 'https://example.com/', maxCredits: '4' } });
    expect(sent.urls).toEqual(['https://example.com/']);
    expect(sent.maxCredits).toBe(4);
    expect(typeof sent.webhook_url).toBe('string');
    expect(out).toEqual({ id: 'b1', status: 'queued', url: 'https://example.com/' });
  });

  it('resumes with the page, read from the API', async () => {
    api().get(`${P}/scrape/b1`).query({ formats: 'markdown' }).reply(200, {
      id: 'b1', status: 'done',
      pages: [{ url: 'https://example.com/', status: 'ok', pageStatus: 'ok', verdict: 'ok', reason: '', httpStatus: 200,
        head: { title: 'Example Domain' }, markdown: '# Example', words: 30, language: 'en', credits: 1,
        crawledAt: '2026-10-19T05:53:37.150000+00:00' }],
    });
    const out = await appTester(op.performResume, { authData: auth, outputData: { id: 'b1', url: 'https://example.com/' } });
    expect(out).toMatchObject({ scrapeId: 'b1', url: 'https://example.com/', title: 'Example Domain', markdown: '# Example',
      httpStatus: 200, pageStatus: 'ok', words: 30, credits: 1 });
  });

  it('fails the step, saying why, for a missing or blocked page, though it came back with the error page as text', async () => {
    for (const [id, status, reason] of [['b2', 'missing', 'HTTP 404: no such page'], ['b3', 'blocked', 'HTTP 403 from the origin']]) {
      api().get(`${P}/scrape/${id}`).query({ formats: 'markdown' }).reply(200, {
        id, status: 'done', pages: [{ url: 'https://x.test/', status, pageStatus: status, verdict: status, reason,
          httpStatus: status === 'missing' ? 404 : 403, markdown: '# Error response', words: 0, credits: 0 }],
      });
      await expect(appTester(op.performResume, { authData: auth, outputData: { id, url: 'https://x.test/' } }))
        .rejects.toThrow(`MeshArc could not read https://x.test/: ${reason}.`);
    }
  });

  it('takes a short (thin) page as read', async () => {
    api().get(`${P}/scrape/b4`).query({ formats: 'markdown' }).reply(200, {
      id: 'b4', status: 'done', pages: [{ url: 'https://x.test/', status: 'thin', pageStatus: 'thin', httpStatus: 200, markdown: 'Hi', words: 1 }],
    });
    await expect(appTester(op.performResume, { authData: auth, outputData: { id: 'b4', url: 'https://x.test/' } }))
      .resolves.toMatchObject({ pageStatus: 'thin', markdown: 'Hi' });
  });
});

describe('Start Crawl', () => {
  it('starts the crawl with only the options given', async () => {
    let sent;
    api().post(`${P}/crawl`, (b) => { sent = b; return true; }).reply(202, { id: 'c1', status: 'queued', counts: { ok: 0, thin: 0, blocked: 0, error: 0, skipped: 0 }, progress: { done: 3, total: 20, queued: 1 } });
    const out = await appTester(App.creates.start_crawl.operation.perform, { authData: auth,
      inputData: { url: 'https://example.com/blog/', limit: '20', includePaths: ['/blog/*', ' '], maxDepth: '' } });
    expect(sent).toEqual({ url: 'https://example.com/blog/', limit: 20, includePaths: ['/blog/*'] });
    expect(out).toMatchObject({ id: 'c1', status: 'queued', pagesSoFar: 3, resultsUrl: `${API}/crawl/c1` });
  });
});

describe('Search the Web', () => {
  const op = App.creates.search_web.operation;

  it('starts a search that will call Zapier back when it ends', async () => {
    let sent;
    api().post(`${P}/search`, (b) => { sent = b; return true; }).reply(202, { id: 's1', status: 'queued' });
    const out = await appTester(op.perform, { authData: auth, inputData: { query: 'web scraping api', limit: '3', country: 'US' } });
    expect(sent).toMatchObject({ query: 'web scraping api', limit: 3, timeout: 0, country: 'us' });
    expect(sent.webhook.events).toEqual(['search.completed', 'search.failed']);
    expect(typeof sent.webhook.url).toBe('string');
    expect(out).toEqual({ id: 's1', status: 'queued', query: 'web scraping api' });
  });

  it('resumes with the results, read from the API', async () => {
    api().get(`${P}/search/s1`).reply(200, { id: 's1', status: 'done', query: 'q', data: [
      { position: 1, title: 'T1', url: 'https://a.test/', snippet: 'S1', source: 'web', engine: 'google' },
      { position: 2, title: 'T2', url: 'https://b.test/', snippet: 'S2', source: 'web', engine: 'google' },
    ] });
    const out = await appTester(op.performResume, { authData: auth, outputData: { id: 's1' } });
    expect(out).toMatchObject({ searchId: 's1', resultCount: 2, topUrl: 'https://a.test/', topTitle: 'T1' });
    expect(out.results[1]).toEqual({ position: 2, title: 'T2', url: 'https://b.test/', snippet: 'S2', engine: 'google' });
  });

  it('says so when every engine refused the search', async () => {
    api().get(`${P}/search/s2`).reply(200, { id: 's2', status: 'blocked', query: 'q', data: [] });
    await expect(appTester(op.performResume, { authData: auth, outputData: { id: 's2' } })).rejects.toThrow(/refused this search/);
  });
});

// Zapier passes inputs as typed (flags.cleanInputData is false): an optional field left empty
// arrives as '' or [''], and must not reach MeshArc as a value.
describe('optional fields left empty', () => {
  it('Scrape URL sends no credit cap', async () => {
    let sent;
    api().post(`${P}/scrape`, (b) => { sent = b; return true; }).reply(202, { id: 'b9', status: 'queued' });
    await appTester(App.creates.scrape_url.operation.perform, { authData: auth, inputData: { url: 'https://example.com/', maxCredits: '' } });
    expect('maxCredits' in sent).toBe(false);
  });

  it('Start Crawl sends only the URL', async () => {
    let sent;
    api().post(`${P}/crawl`, (b) => { sent = b; return true; }).reply(202, { id: 'c9', status: 'queued', progress: { done: 0 } });
    await appTester(App.creates.start_crawl.operation.perform, { authData: auth,
      inputData: { url: 'https://example.com/', limit: '', maxDepth: '', includePaths: [''], excludePaths: '' } });
    expect(sent).toEqual({ url: 'https://example.com/' });
  });

  it('Search the Web uses 5 results and no country', async () => {
    let sent;
    api().post(`${P}/search`, (b) => { sent = b; return true; }).reply(202, { id: 's9', status: 'queued' });
    await appTester(App.creates.search_web.operation.perform, { authData: auth, inputData: { query: 'q', limit: '', country: '' } });
    expect([sent.limit, 'country' in sent]).toEqual([5, false]);
  });

  it('New Changed Page with no kinds chosen fires on added, modified and removed', async () => {
    const op = App.triggers.changed_page.operation;
    const body = JSON.stringify(runMessage());
    api().get(`${P}/projects/${PROJECT}/changes`).query({ run_id: 'run-2' }).reply(200, change('chg-2', 'run-2', feed));
    const out = await appTester(op.perform, { authData: auth, inputData: { project: PROJECT, kinds: [''] },
      subscribeData: { id: 'sub-1', secret: SECRET }, rawRequest: signed(body), cleanedRequest: JSON.parse(body) });
    expect(out.map((i) => i.kind)).toEqual(['modified', 'added']);
  });
});

describe('errors', () => {
  it("passes MeshArc's own reason on", async () => {
    api().post(`${P}/crawl`).reply(402, { error: 'payment required', code: 'credits_exhausted', detail: 'This workspace has used its credits for the month.' });
    await expect(appTester(App.creates.start_crawl.operation.perform, { authData: auth, inputData: { url: 'https://example.com/' } }))
      .rejects.toThrow(/used its credits for the month/);
  });

  it('tells a read-only key what it needs', async () => {
    api().post(`${P}/crawl`).reply(403, { error: 'forbidden', detail: 'this needs the member role' });
    await expect(appTester(App.creates.start_crawl.operation.perform, { authData: auth, inputData: { url: 'https://example.com/' } }))
      .rejects.toThrow(/can only read/);
  });
});
