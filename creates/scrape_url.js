const { call, simplifyPage } = require('../lib/api');

// A page can take a minute to read past a bot wall, longer than Zapier waits for an action.
// So the scrape is started with Zapier's callback URL as its webhook, and the step resumes
// when MeshArc posts that the page is in.
const perform = async (z, bundle) => {
  const body = { urls: [bundle.inputData.url], webhook_url: z.generateCallbackUrl() };
  if (bundle.inputData.maxCredits) body.maxCredits = Number(bundle.inputData.maxCredits);
  const response = await call(z, 'POST', '/scrape', { body });
  return { id: response.data.id, status: response.data.status, url: bundle.inputData.url };
};

// MeshArc said the scrape ended: read the page itself, with the connected key.
const performResume = async (z, bundle) => {
  const id = bundle.outputData.id;
  const response = await call(z, 'GET', `/scrape/${encodeURIComponent(id)}`, { params: { formats: 'markdown' } });
  const page = (response.data.pages || [])[0];
  // Read means ok, or thin (a short page). A 404 or a bot wall comes back with the error page
  // as its markdown, so the status decides, not whether there is text.
  const read = page && ['ok', 'thin'].includes(page.pageStatus || page.status);
  if (!read) {
    const why = page ? page.reason || page.pageStatus || page.status : response.data.status;
    throw new z.errors.Error(`MeshArc could not read ${bundle.outputData.url}: ${why || 'no page came back'}.`,
      'ScrapeFailed', 422);
  }
  return { scrapeId: id, ...simplifyPage(page) };
};

module.exports = {
  key: 'scrape_url',
  noun: 'Page',
  display: {
    label: 'Scrape URL',
    description: 'Reads a web page and returns it as clean markdown, past bot walls when needed.',
  },
  operation: {
    inputFields: [
      { key: 'url', label: 'URL', required: true, helpText: 'The page to read, such as `https://example.com/pricing`.' },
      {
        key: 'maxCredits',
        label: 'Max Credits',
        type: 'integer',
        required: false,
        helpText: 'The most this page may cost. A plain page is 1 credit; one behind a bot wall can cost more. Leave it empty for no limit.',
      },
    ],
    perform,
    performResume,
    sample: {
      scrapeId: '9b1c2f0e4d3a4b5c8e7f6a5b4c3d2e1f',
      url: 'https://example.com/',
      title: 'Example Domain',
      markdown: '# Example Domain\n\nThis domain is for use in documentation examples without needing permission.',
      httpStatus: 200,
      pageStatus: 'ok',
      words: 30,
      language: 'en',
      credits: 1,
      crawledAt: '2026-10-19T05:00:00+00:00',
    },
    outputFields: [
      { key: 'url', label: 'URL' },
      { key: 'title', label: 'Title' },
      { key: 'markdown', label: 'Markdown' },
      { key: 'httpStatus', label: 'HTTP Status', type: 'integer' },
      { key: 'pageStatus', label: 'Page Status' },
      { key: 'words', label: 'Words', type: 'integer' },
      { key: 'language', label: 'Language' },
      { key: 'credits', label: 'Credits', type: 'integer' },
      { key: 'crawledAt', label: 'Read At', type: 'datetime' },
      { key: 'scrapeId', label: 'Scrape ID' },
    ],
  },
};
