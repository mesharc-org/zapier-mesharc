const { API } = require('./lib/api');

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Create a key under **Settings → API keys** at [mesharc.dev](https://mesharc.dev). ' +
        'Scraping, crawling, searching and the trigger need a key that can write.',
    },
  ],
  test: {
    url: `${API}/me`,
    method: 'GET',
  },
  // The workspace the key belongs to. Zapier hands the test's answer (/me) to the label as
  // bundle.inputData.
  connectionLabel: '{{bundle.inputData.name}}',
};
