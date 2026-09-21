import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import routes from '../routes.json' with { type: 'json' };
import { identity, readProfile, requirePremium, repairProfile, publicProfile } from './auth.js';
import { ApiError } from './errors.js';
import { sports, catalog, fixture, summary, detail, standing, asOf, type Sport } from './specimens.js';

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const requestId = event.requestContext.requestId;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8', 'X-Request-Id': requestId, 'Cache-Control': 'private, no-store',
  };
  const ok = (data: unknown, list = false, extra = {}) => ({ statusCode: 200, headers,
    body: JSON.stringify({ data, ...(list ? { nextCursor: null } : {}), ...extra, requestId }) });
  try {
    // Function configuration selects the route and privileges. Request data cannot override them.
    const route = routes.find(r => r.id === process.env.ROUTE_ID);
    if (!route || event.routeKey !== `${route.method} /v1${route.path}`) throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
    let profile;
    if (route.auth !== 'public') {
      const owner = identity(event);
      profile = route.auth === 'premium' ? await requirePremium(owner.sub) : await readProfile(owner.sub);
      if (!profile && route.id === 'profile-get') profile = await repairProfile(owner.sub, owner.username);
      if (!profile) throw new ApiError(409, 'PROFILE_NOT_READY', 'Open your profile before continuing.');
    }
    const q = event.queryStringParameters ?? {};
    const p = event.pathParameters ?? {};
    const list = route.id === 'fixtures-list' || ['football-list', 'basketball-list', 'tennis-list'].includes(route.id);
    const allowed = route.id === 'competitions-list' ? ['sport'] : route.id === 'standings-list' ? ['season', 'limit', 'cursor']
      : list ? ['competitionId', 'from', 'to', 'status', 'limit', 'cursor', ...(route.id === 'fixtures-list' ? ['sport'] : [])] : [];
    if (Object.keys(q).some(k => !allowed.includes(k))) throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown query parameter.');
    if (route.method === 'GET' && event.body) throw new ApiError(400, 'VALIDATION_ERROR', 'GET requests must not contain a body.');
    if (route.id === 'profile-get') {
      headers.ETag = `"${profile!.version}"`;
      return ok(publicProfile(profile!));
    }
    if (route.id === 'profile-patch') {
      const h = Object.fromEntries(Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]));
      if (!h['if-match']) throw new ApiError(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
      if (h['if-match'] !== `"${profile!.version}"`) throw new ApiError(412, 'VERSION_CONFLICT', 'The profile version has changed.');
      // Reserved contract route. No UpdateItem permission and no false mutation acknowledgement.
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Profile updates are not enabled in this foundation.');
    }
    const sportText = route.path.startsWith('/predictions/') ? route.path.split('/')[2]
      : p.sport ?? q.sport ?? p.fixtureId?.split(':')[0];
    if (sportText && !sports.includes(sportText as Sport)) throw new ApiError(400, 'UNSUPPORTED_SPORT', 'Unsupported sport.');
    const sport = sportText as Sport;
    if (route.id === 'fixtures-list' && !sport) throw new ApiError(400, 'VALIDATION_ERROR', 'sport is required.');
    if (q.limit && (!/^\d+$/.test(q.limit) || +q.limit < 1 || +q.limit > 100)) throw new ApiError(400, 'VALIDATION_ERROR', 'limit must be between 1 and 100.');
    if (q.cursor) throw new ApiError(400, 'VALIDATION_ERROR', 'No cursor is valid for these unconnected stubs.');
    if (q.status && !['scheduled', 'live', 'finished', 'postponed', 'cancelled'].includes(q.status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid status.');
    const today = new Date().toISOString().slice(0, 10);
    const from = q.from ?? today;
    const to = q.to ?? new Date(Date.parse(`${today}T00:00:00.000Z`) + 7 * 86400000).toISOString().slice(0, 10);
    if (list) {
      for (const value of [from, to]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid YYYY-MM-DD date.');
      }
      const span = (Date.parse(to) - Date.parse(from)) / 86400000;
      if (span < 0 || span > 30) throw new ApiError(400, 'VALIDATION_ERROR', 'The range must include between 1 and 31 dates.');
    }
    const competitionId = p.competitionId ?? q.competitionId;
    if (competitionId && !catalog.some(c => c.id === competitionId && c.sport === sport)) throw new ApiError(400, 'UNSUPPORTED_COMPETITION', 'Unsupported competition.');
    if (route.id === 'standings-list' && !/^\d{4}$/.test(q.season ?? '')) throw new ApiError(400, 'VALIDATION_ERROR', 'season is required as a four-digit year.');
    if (route.auth === 'premium' && !p.fixtureId?.startsWith(`${sport}:`)) throw new ApiError(404, 'NOT_FOUND', 'Fixture not found.');
    if (process.env.STAGE !== 'dev' || process.env.STUB_RESPONSES !== 'true') throw new ApiError(503, 'DATA_UNAVAILABLE', 'No sports snapshot is connected yet.');
    headers['X-PredictArena-Stub'] = 'true';
    if (route.id === 'competitions-list') return ok(catalog.filter(c => !sport || c.sport === sport), true);
    const sample = fixture(sport);
    if (route.id === 'fixture-get') {
      if (p.fixtureId !== sample.id) throw new ApiError(404, 'NOT_FOUND', 'No specimen exists for that fixture.');
      return ok(sample);
    }
    if (route.auth === 'premium') {
      if (p.fixtureId !== sample.id) throw new ApiError(404, 'PREDICTION_NOT_READY', 'No specimen exists for that prediction.');
      return ok(detail(sport));
    }
    if (route.id === 'standings-list') return ok(
      competitionId === sample.competitionId && q.season === sample.season ? [standing(sport)] : [], true, { asOf, isStale: true });
    const matches = (!competitionId || competitionId === sample.competitionId) && (q.status ?? 'scheduled') === sample.status
      && sample.startsAt.slice(0, 10) >= from && sample.startsAt.slice(0, 10) <= to;
    return ok(matches ? [route.id === 'fixtures-list' ? sample : summary(sport)] : [], true);
  } catch (error) {
    const e = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
    if (e.status === 503 || e.status === 429) headers['Retry-After'] = '30';
    return { statusCode: e.status, headers, body: JSON.stringify({ error: { code: e.code, message: e.message, details: [] }, requestId }) };
  }
}
