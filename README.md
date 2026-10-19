# MeshArc for Zapier

The Zapier integration for [MeshArc](https://mesharc.dev), the web crawler. Start Zaps when a site you watch changes, and read pages, crawl sites and search the web from any Zap.

## What it does

| | Name | What it does |
|---|---|---|
| Trigger (instant) | **New Changed Page** | Starts the Zap when a run of a MeshArc project finds a page added, modified or removed. Each changed page is one item: kind, URL, title, words added and removed, and the run. |
| Action | **Scrape URL** | Reads a page and returns it as clean markdown, past bot walls when needed: URL, title, markdown, HTTP status, words, credits. |
| Action | **Start Crawl** | Starts crawling a site or a section of it (max pages, max depth, include and exclude paths), and returns the crawl's ID. |
| Action | **Search the Web** | Searches the web and returns up to 10 results: title, URL and snippet. |

## Connecting

1. Sign in at [mesharc.dev](https://mesharc.dev). The free plan includes 1,000 credits with no card.
2. Go to **Settings → API keys** and create a key that can **write**.
3. In Zapier, connect MeshArc and paste the key. The connection is named after your MeshArc workspace.

## How New Changed Page works

1. In MeshArc, create a project for the site you want to watch, and give it a schedule (hourly, daily, weekly). MeshArc crawls on that schedule and records what changed.
2. In Zapier, pick **New Changed Page**, choose the **Project**, and optionally which **Changes** start the Zap.

Turning the Zap on subscribes it to the project in MeshArc. MeshArc sends each finished run to Zapier as soon as its changes are recorded, signed with a secret of the subscription's own. The Zap reads the run's changed pages from the API with your key. Turning the Zap off removes the subscription. A webhook URL you set on the project in MeshArc is not touched.

A project's first run has nothing to compare with, and a run that changed nothing starts nothing.

## Long actions

A page behind a bot wall, or a web search, can take longer than Zapier waits for an action. **Scrape URL** and **Search the Web** therefore start the work with a callback, and the step finishes when MeshArc reports that it is done. In Zap history, the step shows as waiting until then.

## Cost

Requests are billed in MeshArc credits: a plain page read is 1 credit, and blocked pages and 404s cost nothing. A web search costs what its results page costs. The trigger only reads what MeshArc already recorded, so it costs nothing. See [pricing](https://mesharc.dev/pricing).

## Development

```bash
npm ci
npm test            # offline tests; every API answer is mocked
```

The live tests run against a MeshArc that can reach this machine, such as a local one started with `ALLOW_PRIVATE_TARGETS=1`; the header of `test/live.test.js` lists the variables. A local server stands in for Zapier's URLs, so nothing leaves the machine.

To push a version to Zapier: `npx zapier-platform-cli login`, then `npx zapier-platform-cli push`.

## License

[MIT](LICENSE)
