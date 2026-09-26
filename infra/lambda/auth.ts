import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ApiError } from './errors.js';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 2 }));
const cognito = new CognitoIdentityProviderClient({ maxAttempts: 2 });
export type Profile = {
  id: string; email: string; displayName: string; timezone: string; favoriteSports: string[];
  plan: 'free' | 'premium'; premiumUntil: string | null; subscriptionStatus: string;
  entitlementRevoked: boolean; ownerAccess?: boolean; createdAt: string; updatedAt: string; version: number;
};

export function identity(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const c = event.requestContext.authorizer?.jwt?.claims;
  if (!c || c.token_use !== 'access' || c.client_id !== process.env.COGNITO_CLIENT_ID ||
    typeof c.sub !== 'string' || !/^[A-Za-z0-9-]+$/.test(c.sub) ||
    typeof c.scope !== 'string' || !c.scope.split(' ').includes('predictarena/api')) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid Cognito access token is required.');
  }
  return { sub: c.sub, username: typeof c.username === 'string' ? c.username : '' };
}
export async function readProfile(sub: string): Promise<Profile | undefined> {
  try {
    const result = await db.send(new GetCommand({
      TableName: process.env.USERS_TABLE, Key: { pk: `USER#${sub}`, sk: 'PROFILE' }, ConsistentRead: true,
    }));
    return result.Item as Profile | undefined;
  } catch {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Account storage is temporarily unavailable.');
  }
}
export function effectivePremium(p: Profile, now = Date.now()) {
  return p.entitlementRevoked === false && (p.ownerAccess === true ||
    (p.plan === 'premium' && typeof p.premiumUntil === 'string' &&
      Number.isFinite(Date.parse(p.premiumUntil)) && Date.parse(p.premiumUntil) > now));
}
// Fresh, strongly consistent base-table read on every premium request. No cached or JWT plan.
export async function requirePremium(sub: string, read = readProfile, now = Date.now()) {
  let p: Profile | undefined;
  try { p = await read(sub); }
  catch { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Account storage is temporarily unavailable.'); }
  if (!p) throw new ApiError(409, 'PROFILE_NOT_READY', 'Open your profile before continuing.');
  if (!effectivePremium(p, now)) throw new ApiError(403, 'PREMIUM_REQUIRED', 'Premium access is required.');
  return p;
}
export function publicProfile(p: Profile) {
  const now = Date.now();
  return {
    id: p.id, email: p.email, displayName: p.displayName, timezone: p.timezone, favoriteSports: p.favoriteSports,
    plan: effectivePremium(p, now) ? 'premium' : 'free', premiumUntil: p.premiumUntil,
    subscriptionStatus: p.ownerAccess === true && !p.entitlementRevoked ? 'owner' :
      p.premiumUntil && Date.parse(p.premiumUntil) <= now ? 'expired' : p.subscriptionStatus,
    createdAt: p.createdAt, updatedAt: p.updatedAt, version: p.version,
  };
}
export async function createProfile(sub: string, attributes: Record<string, string>) {
  if (!sub || attributes.sub !== sub || attributes.email_verified !== 'true' || !attributes.email) {
    throw new ApiError(409, 'PROFILE_NOT_READY', 'A verified Cognito email is required.');
  }
  const now = new Date().toISOString();
  const item = {
    pk: `USER#${sub}`, sk: 'PROFILE', id: sub, email: attributes.email,
    displayName: (attributes.name?.trim() || attributes.email.split('@')[0]).slice(0, 80),
    timezone: 'Africa/Lagos', favoriteSports: [], plan: 'free', premiumUntil: null, ownerAccess: false,
    subscriptionStatus: 'none', cancelAtPeriodEnd: false, entitlementRevoked: false,
    paystackCustomerCode: null, paystackSubscriptionCode: null, billingVersion: 1,
    version: 1, createdAt: now, updatedAt: now,
  };
  try {
    await db.send(new PutCommand({ TableName: process.env.USERS_TABLE, Item: item,
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)' }));
  } catch (error) {
    if (!(error instanceof Error && error.name === 'ConditionalCheckFailedException')) {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Account setup is temporarily unavailable.');
    }
  }
}
export async function repairProfile(sub: string, username: string) {
  if (!username) throw new ApiError(409, 'PROFILE_NOT_READY', 'Verified identity is unavailable.');
  let attrs: Record<string, string>;
  try {
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: process.env.COGNITO_USER_POOL_ID, Username: username }));
    if (!user.Enabled) throw new Error('disabled');
    attrs = Object.fromEntries((user.UserAttributes ?? []).map(a => [a.Name!, a.Value!]));
  } catch {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Identity verification is temporarily unavailable.');
  }
  await createProfile(sub, attrs);
  return readProfile(sub);
}
