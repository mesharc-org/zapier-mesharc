/* Live, against a MeshArc that can reach this machine (a local one: ALLOW_PRIVATE_TARGETS=1).
 *
 *   MESHARC_LIVE=1 MESHARC_API_URL=http://127.0.0.1:8031/api/v1 MESHARC_API_KEY=mesharc_... \
 *   MESHARC_PROJECT=<id of a project crawling MESHARC_SITE> MESHARC_SITE=http://127.0.0.1:8097/ \
 *   MESHARC_SITE_DIR=<the folder that site serves> npx jest test/live.test.js
 *
 * A local server stands in for Zapier's hook and callback URLs, so nothing leaves the machine.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const zapier = require('zapier-platform-core');

const live = process.env.MESHARC_LIVE === '1';
const describeLive = live ? describe : describe.skip;

describeLive('live, against a local MeshArc', () => {
  const App = require('../index');
  const { API } = require('../lib/api');
  const appTester = zapier.createAppTester(App);
  const authData = { apiKey: process.env.MESHARC_API_KEY };
  const project = process.env.MESHARC_PROJECT;
  const site = process.env.MESHARC_SITE;
  const pricing = path.join(process.env.MESHARC_SITE_DIR || '', 'pricing.html');
  const received = [];
  let server;
  let base;

  const api = async (method, p, body) => {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: { Authorization: `Bearer ${authData.apiKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const waitFor = async (match, seconds) => {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      const hit = received.find(match);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('nothing arrived in time');
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let content = '';
      req.on('data', (c) => { content += c; });
      req.on('end', () => {
        received.push({ path: req.url, headers: req.headers, content, json: JSON.parse(content || '{}') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('New Changed Page: subscribes, gets a real signed run, turns it into items, unsubscribes', async () => {
    const op = App.triggers.changed_page.operation;
    const inputData = { project };
    const sub = await appTester(op.performSubscribe, { authData, inputData, targetUrl: `${base}/hook` });
    expect(sub.secret).toMatch(/^whsec_/);
    const listed = (await api('GET', `/webhooks/subscriptions?projectId=${project}`)).body.subscriptions;
    expect(listed.map((s) => [s.id, s.url, s.label, s.events])).toContainEqual([sub.id, `${base}/hook`, 'Zapier', ['run.finished']]);

    // A real change on the site, and a real run.
    const before = fs.readFileSync(pricing, 'utf8');
    const stamp = `Updated ${Date.now()}.`;
    fs.writeFileSync(pricing, before.replace('</main>', `<p>${stamp} The anvil price is under review this week.</p></main>`));
    const run = (await api('POST', `/projects/${project}/runs`, {})).body;
    const runId = run.runId || run.id;
    const message = await waitFor((m) => m.path === '/hook' && m.json.event === 'run.finished' && m.json.data.run.id === runId, 240);

    // As Zapier hands it to perform: the raw body, its headers, and the parsed body.
    const rawRequest = { content: message.content, headers: {} };
    for (const [k, v] of Object.entries(message.headers)) {
      rawRequest.headers[`Http-${k.replace(/(^|-)([a-z])/g, (_m, d, c) => d + c.toUpperCase())}`] = v;
    }
    const items = await appTester(op.perform, { authData, inputData, subscribeData: sub, rawRequest, cleanedRequest: message.json });
    expect(items.map((i) => [i.kind, i.url])).toContainEqual(['modified', `${site}pricing.html`]);
    expect(items.every((i) => i.runId === runId && i.id.startsWith(`${i.changeId}:`))).toBe(true);

    // The same body under a forged signature starts nothing.
    const forged = { ...rawRequest, headers: { ...rawRequest.headers, 'Http-X-Mesharc-Signature': 'sha256=00' } };
    expect(await appTester(op.perform, { authData, inputData, subscribeData: sub, rawRequest: forged, cleanedRequest: message.json })).toEqual([]);

    // Sample data has the live items' keys.
    const sample = await appTester(op.performList, { authData, inputData });
    expect(Object.keys(sample[0]).sort()).toEqual(Object.keys(op.sample).sort());

    await appTester(op.performUnsubscribe, { authData, inputData, subscribeData: sub });
    const after = (await api('GET', `/webhooks/subscriptions?projectId=${project}`)).body.subscriptions;
    expect(after.map((s) => s.id)).not.toContain(sub.id);
    fs.writeFileSync(pricing, before);
  });

  it('Scrape URL: the scrape the action starts calls back, and the step resumes with the page', async () => {
    // The body perform sends, with this machine standing in for Zapier's callback URL.
    const started = await api('POST', '/scrape', { urls: [`${site}pricing.html`], webhook_url: `${base}/callback` });
    expect(started.status).toBe(202);
    const callback = await waitFor((m) => m.path === '/callback' && m.json.event === 'scrape.completed', 120);
    expect(callback.json.data.batch.id).toBe(started.body.id);
    const page = await appTester(App.creates.scrape_url.operation.performResume,
      { authData, outputData: { id: started.body.id, url: `${site}pricing.html` } });
    expect(page).toMatchObject({ url: `${site}pricing.html`, title: 'Pricing | Acme', pageStatus: 'ok' });
    expect(page.markdown).toMatch(/anvil/);
    expect(Object.keys(page).sort()).toEqual(Object.keys(App.creates.scrape_url.operation.sample).sort());
  });

  it('Start Crawl: starts a crawl the API then reports', async () => {
    const out = await appTester(App.creates.start_crawl.operation.perform, { authData, inputData: { url: site, limit: '2' } });
    expect(out.id).toBeTruthy();
    expect(typeof out.pagesSoFar).toBe('number');
    expect((await api('GET', `/crawl/${out.id}`)).status).toBe(200);
    expect(Object.keys(out).sort()).toEqual(Object.keys(App.creates.start_crawl.operation.sample).sort());
  });
});
