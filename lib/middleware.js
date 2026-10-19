/** Every request carries the key as a bearer token. */
const addApiKey = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.apiKey) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
  }
  return request;
};

/** MeshArc's refusals, in its own words: `detail` says what was wrong. */
const explainErrors = (response, z) => {
  if (response.status < 400 || response.skipThrowForStatus) return response;
  let detail = '';
  let code = '';
  try {
    const body = typeof response.json === 'object' && response.json ? response.json : JSON.parse(response.content);
    detail = body.detail || body.error || '';
    code = body.code || '';
  } catch (error) {
    detail = String(response.content || '').slice(0, 300);
  }
  if (response.status === 401) {
    throw new z.errors.Error(
      'MeshArc did not accept the API key. Check it under Settings → API keys at mesharc.dev, then reconnect.',
      'AuthenticationError',
      401,
    );
  }
  if (response.status === 403 && /role|scope/i.test(detail)) {
    throw new z.errors.Error(
      'This API key can only read. Use a key that can write, then reconnect.',
      'Forbidden',
      403,
    );
  }
  throw new z.errors.Error(detail || `MeshArc answered ${response.status}.`, code || 'ApiError', response.status);
};

module.exports = { addApiKey, explainErrors };
