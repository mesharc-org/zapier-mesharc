const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { addApiKey, explainErrors } = require('./lib/middleware');
const changedPage = require('./triggers/changed_page');
const project = require('./triggers/project');
const scrapeUrl = require('./creates/scrape_url');
const startCrawl = require('./creates/start_crawl');
const searchWeb = require('./creates/search_web');

module.exports = {
  version,
  platformVersion,
  authentication,
  beforeRequest: [addApiKey],
  afterResponse: [explainErrors],
  triggers: {
    [changedPage.key]: changedPage,
    [project.key]: project,
  },
  creates: {
    [scrapeUrl.key]: scrapeUrl,
    [startCrawl.key]: startCrawl,
    [searchWeb.key]: searchWeb,
  },
};
