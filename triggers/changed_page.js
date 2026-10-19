const { call, rawHeader, runChangeItems, validSignature, wantedKinds } = require('../lib/api');

/** At most this many recent runs are looked through for sample data. */
const MAX_SAMPLE_RUNS = 10;

// The Zap is switched on: MeshArc sends this Zap's URL each finished run of the project.
const performSubscribe = async (z, bundle) => {
  const response = await call(z, 'POST', '/webhooks/subscriptions', {
    body: { projectId: bundle.inputData.project, url: bundle.targetUrl, events: ['run.finished'], label: 'Zapier' },
  });
  // Kept by Zapier as bundle.subscribeData: the id to unsubscribe with, the secret to check messages with.
  return response.data.subscription;
};

// The Zap is switched off or deleted.
const performUnsubscribe = async (z, bundle) => {
  const id = (bundle.subscribeData || {}).id;
  if (!id) return {};
  // 404: already gone (removed in MeshArc, or with its project).
  await call(z, 'DELETE', `/webhooks/subscriptions/${encodeURIComponent(id)}`, { skipThrowForStatus: true });
  return {};
};

// A finished run, posted by MeshArc: its changed pages are the Zap's items.
const perform = async (z, bundle) => {
  const raw = bundle.rawRequest;
  const secret = (bundle.subscribeData || {}).secret;
  // Only messages MeshArc signed with this subscription's secret start the Zap. The items
  // themselves are always read from the API with the connected key, never from the message.
  if (raw && typeof raw.content === 'string' &&
      !validSignature(secret, raw.content, rawHeader(raw, 'X-MeshArc-Signature'))) {
    z.console.log('MeshArc: a message without a valid signature was ignored');
    return [];
  }
  const message = bundle.cleanedRequest || {};
  if (message.event !== 'run.finished') return [];
  const data = message.data || {};
  const run = data.run || {};
  const projectId = String(bundle.inputData.project || '');
  // A baseline run compares nothing; a run of another project is not this Zap's.
  if (data.baseline || (data.project || {}).id !== projectId || !run.id) return [];
  return runChangeItems(z, projectId, run.id, wantedKinds(bundle.inputData));
};

// Sample data, and the polling fallback: the latest run that changed something.
const performList = async (z, bundle) => {
  const projectId = String(bundle.inputData.project || '');
  const kinds = wantedKinds(bundle.inputData);
  const latest = await call(z, 'GET', `/projects/${encodeURIComponent(projectId)}/changes`);
  const runs = (latest.data.runs || []).filter((run) => run.id && !run.baseline);
  for (const run of runs.slice(0, MAX_SAMPLE_RUNS)) {
    const found = await runChangeItems(z, projectId, run.id, kinds);
    if (found.length) return found;
  }
  return [];
};

module.exports = {
  key: 'changed_page',
  noun: 'Changed Page',
  display: {
    label: 'New Changed Page',
    description: 'Triggers when a run of a MeshArc project finds a page added, modified or removed.',
  },
  operation: {
    type: 'hook',
    inputFields: [
      {
        key: 'project',
        label: 'Project',
        required: true,
        dynamic: 'project.id.name',
        helpText: 'The MeshArc project that watches the site. How often it crawls is set in MeshArc.',
      },
      {
        key: 'kinds',
        label: 'Changes',
        list: true,
        required: false,
        choices: { added: 'Added', modified: 'Modified', removed: 'Removed', fields: 'Fields Changed' },
        helpText: 'Which kinds of change start the Zap. Leave it empty for added, modified and removed pages.',
      },
    ],
    performSubscribe,
    performUnsubscribe,
    perform,
    performList,
    sample: {
      id: 'cba29319a0184bb28e8e528cd22e4cb1:https://news.ycombinator.com/newest',
      projectId: '58a019f9742f4d488a1d108d0c2f945f',
      runId: '69b2d5210fc9432da79283bcf07ef95e',
      previousRunId: '872880310fc54c1883592a383c705f08',
      changeId: 'cba29319a0184bb28e8e528cd22e4cb1',
      changedAt: '2026-10-16T07:46:32.516000+00:00',
      kind: 'modified',
      url: 'https://news.ycombinator.com/newest',
      path: '/newest',
      title: 'New Links | Hacker News',
      wordsAdded: 759,
      wordsRemoved: 748,
      wordsBefore: 784,
      wordsAfter: 791,
    },
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'kind', label: 'Change' },
      { key: 'url', label: 'URL' },
      { key: 'path', label: 'Path' },
      { key: 'title', label: 'Title' },
      { key: 'wordsAdded', label: 'Words Added', type: 'integer' },
      { key: 'wordsRemoved', label: 'Words Removed', type: 'integer' },
      { key: 'wordsBefore', label: 'Words Before', type: 'integer' },
      { key: 'wordsAfter', label: 'Words After', type: 'integer' },
      { key: 'changedAt', label: 'Changed At', type: 'datetime' },
      { key: 'projectId', label: 'Project ID' },
      { key: 'runId', label: 'Run ID' },
      { key: 'previousRunId', label: 'Previous Run ID' },
      { key: 'changeId', label: 'Change ID' },
    ],
  },
};
