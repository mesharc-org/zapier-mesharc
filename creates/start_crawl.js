const { API, call } = require('../lib/api');

const paths = (value) => [].concat(value || []).map((p) => String(p).trim()).filter(Boolean);

const perform = async (z, bundle) => {
  const input = bundle.inputData;
  const body = { url: input.url };
  if (input.limit) body.limit = Number(input.limit);
  if (input.maxDepth !== undefined && input.maxDepth !== null && input.maxDepth !== '') body.maxDepth = Number(input.maxDepth);
  if (paths(input.includePaths).length) body.includePaths = paths(input.includePaths);
  if (paths(input.excludePaths).length) body.excludePaths = paths(input.excludePaths);
  const response = await call(z, 'POST', '/crawl', { body });
  const job = response.data;
  return {
    id: job.id,
    status: job.status,
    url: input.url,
    pagesSoFar: (job.progress || {}).done === undefined ? null : job.progress.done,
    resultsUrl: `${API}/crawl/${job.id}`,
  };
};

module.exports = {
  key: 'start_crawl',
  noun: 'Crawl',
  display: {
    label: 'Start Crawl',
    description: "Starts crawling a site or a section of it, and returns the crawl's ID.",
  },
  operation: {
    inputFields: [
      { key: 'url', label: 'URL', required: true, helpText: 'Where the crawl starts, such as `https://example.com/blog/`.' },
      {
        key: 'limit',
        label: 'Max Pages',
        type: 'integer',
        required: false,
        default: '50',
        helpText: 'The most pages to read. Each page costs credits, so start small.',
      },
      {
        key: 'maxDepth',
        label: 'Max Depth',
        type: 'integer',
        required: false,
        helpText: 'How many links away from the start page to go. Leave it empty for no limit.',
      },
      {
        key: 'includePaths',
        label: 'Include Paths',
        list: true,
        required: false,
        helpText: 'Only read pages whose path matches one of these, such as `/blog/*`.',
      },
      {
        key: 'excludePaths',
        label: 'Exclude Paths',
        list: true,
        required: false,
        helpText: 'Skip pages whose path matches one of these, such as `/tag/*`.',
      },
    ],
    perform,
    sample: {
      id: 'b2a1c3d4e5f60718293a4b5c6d7e8f90',
      status: 'queued',
      url: 'https://example.com/blog/',
      pagesSoFar: 0,
      resultsUrl: 'https://api.mesharc.dev/api/v1/crawl/b2a1c3d4e5f60718293a4b5c6d7e8f90',
    },
    outputFields: [
      { key: 'id', label: 'Crawl ID' },
      { key: 'status', label: 'Status' },
      { key: 'url', label: 'URL' },
      { key: 'pagesSoFar', label: 'Pages So Far', type: 'integer' },
      { key: 'resultsUrl', label: 'Results URL' },
    ],
  },
};
