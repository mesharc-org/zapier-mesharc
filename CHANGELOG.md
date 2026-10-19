# Changelog

## 1.0.0

The first release.

- **New Changed Page** (instant): starts a Zap when a run of a MeshArc project finds a page added, modified or removed. Turning the Zap on subscribes it to the project; MeshArc posts each finished run, signed with the subscription's own secret, and turning the Zap off removes the subscription.
- **Scrape URL**: reads a page as clean markdown, past bot walls when needed.
- **Start Crawl**: starts crawling a site or a section of it.
- **Search the Web**: searches the web and returns the results.
