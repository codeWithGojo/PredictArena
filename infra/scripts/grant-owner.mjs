import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const [emailArgument] = process.argv.slice(2);
const email = emailArgument?.trim().toLowerCase();
const poolId = process.env.COGNITO_USER_POOL_ID;
const table = process.env.USERS_TABLE;
if (!email || !/^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/.test(email) || !poolId || !table) {
  throw new Error('Usage: COGNITO_USER_POOL_ID=<pool> USERS_TABLE=<users-table> node infra/scripts/grant-owner.mjs owner@example.com');
}

const cognito = new CognitoIdentityProviderClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const users = await cognito.send(new ListUsersCommand({ UserPoolId: poolId, Filter: `email = "${email}"`, Limit: 2 }));
if (users.Users?.length !== 1 || !users.Users[0].Enabled) throw new Error('Exactly one enabled Cognito user must match that email.');
const attributes = Object.fromEntries((users.Users[0].Attributes ?? []).map(({ Name, Value }) => [Name, Value]));
if (attributes.email_verified !== 'true' || attributes.email?.toLowerCase() !== email || !attributes.sub) {
  throw new Error('The Cognito user must have that verified email and a stable subject ID.');
}

const key = { pk: `USER#${attributes.sub}`, sk: 'PROFILE' };
const current = await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }));
const profile = current.Item;
if (!profile || profile.id !== attributes.sub || profile.email?.toLowerCase() !== email || !Number.isSafeInteger(profile.version)) {
  throw new Error('The verified user must already have a matching PredictArena profile. Sign in once before granting access.');
}
if (profile.ownerAccess === true) {
  console.log('Owner access already active for this verified Cognito account.');
  process.exit(0);
}

await db.send(new UpdateCommand({ TableName: table, Key: key,
  UpdateExpression: 'SET ownerAccess = :yes, updatedAt = :now, version = :next',
  ConditionExpression: 'attribute_exists(pk) AND email = :email AND version = :previous',
  ExpressionAttributeValues: { ':yes': true, ':now': new Date().toISOString(), ':next': profile.version + 1,
    ':email': profile.email, ':previous': profile.version },
}));
console.log('Owner access granted to the verified account. No subscription was created.');
