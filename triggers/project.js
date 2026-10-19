const { call } = require('../lib/api');

// The workspace's projects, for the Project dropdown. Hidden: not a trigger anyone picks.
const perform = async (z) => {
  const response = await call(z, 'GET', '/projects');
  const rows = Array.isArray(response.data) ? response.data : response.data.data || [];
  return rows.map((p) => {
    const name = String(p.name || p.id);
    // The site in brackets, unless the name already says it.
    const host = p.host && !name.includes(String(p.host)) ? ` (${p.host})` : '';
    return { id: p.id, name: `${name}${host}` };
  });
};

module.exports = {
  key: 'project',
  noun: 'Project',
  display: {
    label: 'New Project',
    description: 'Triggers when a project is added to your MeshArc workspace.',
    hidden: true,
  },
  operation: {
    perform,
    sample: { id: '58a019f9742f4d488a1d108d0c2f945f', name: 'Hacker News (news.ycombinator.com)' },
    outputFields: [
      { key: 'id', label: 'Project ID' },
      { key: 'name', label: 'Name' },
    ],
  },
};
