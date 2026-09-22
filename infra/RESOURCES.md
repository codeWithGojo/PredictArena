# Phase 1 resource inventory

These are Terraform declarations, not resources already deployed to AWS. Nothing has been applied. Names use `predictarena-<stage>` with `stage=dev|prod`. The inventory is 104 managed resource instances per stage, plus 23 shared bootstrap instances when creating the OIDC provider (22 when reusing one). Deploying both stages with one bootstrap gives 231 instances, or 230 with an existing OIDC provider. Nested indexes/settings are included in their parent resources.

## Shared operator-managed bootstrap

| Terraform resource | Instances | Name or purpose |
| --- | ---: | --- |
| `aws_s3_bucket.state` | 1 | Operator-selected state bucket, deletion prevented |
| `aws_s3_bucket_versioning.state` | 1 | State recovery versions |
| `aws_s3_bucket_server_side_encryption_configuration.state` | 1 | AES256 encryption |
| `aws_s3_bucket_public_access_block.state` | 1 | All public access blocked |
| `aws_s3_bucket_ownership_controls.state` | 1 | Bucket owner enforced |
| `aws_s3_bucket_policy.state` | 1 | Deny non-TLS access |
| `aws_iam_openid_connect_provider.github` | 0 or 1 | GitHub Actions issuer and STS audience |
| `aws_iam_policy.runtime_boundary` | 2 | `predictarena-dev-runtime-boundary`, `predictarena-prod-runtime-boundary` |
| `aws_iam_role.github` | 4 | `predictarena-dev-plan`, `predictarena-dev-apply`, `predictarena-prod-plan`, `predictarena-prod-apply` |
| `aws_iam_role_policy.state` | 4 | One `state` policy on each CI role, restricted to that stage's state and lock |
| `aws_iam_role_policy.read` | 4 | One `read-foundation` policy on each CI role |
| `aws_iam_role_policy.apply` | 2 | One `deploy-foundation` policy on each apply role |

Terraform writes `bootstrap/terraform.tfstate`, `dev/terraform.tfstate` and `prod/terraform.tfstate` after migration/deployment. Native S3 locking uses the corresponding `.tflock` objects while commands hold locks. State/lock objects are backend behavior, not additional Terraform resources. There is no DynamoDB lock table or customer-managed KMS key.

## DynamoDB per stage

All five tables have string partition key `pk`, string sort key `sk`, on-demand capacity, encryption and PITR. Production tables have deletion protection. Streams are disabled. Only standings has TTL, on epoch-seconds `expiresAt`.

| Table suffix | Record keys from the contract | Indexes |
| --- | --- | --- |
| `users` | `USER#<sub>` / `PROFILE` | `expiry-index`: `expiryDay` / `expirySort` |
| `fixtures` | `FIXTURE#<fixtureId>` / `META` | `sport-day-index`: `sportDay` / `timeKey`; `competition-day-index`: `competitionDay` / `timeKey` |
| `predictions` | `FIXTURE#<fixtureId>` / `VERSION#<predictionId>` or `LATEST` | None |
| `catalog` | `SPORT#<sport>` / `COMPETITION#<competitionId>` | None |
| `standings` | `TABLE#<competitionId>#<season>` / `LATEST` or `SNAPSHOT#<asOf>#<group>#<zeroPaddedRank>#<participantId>` | None |

Each is an instance of `aws_dynamodb_table.this`. Physical names are `predictarena-<stage>-<suffix>`. Terraform defines keys/indexes; ingestion-owned records are not seeded.

## Identity and API per stage

| Terraform resource | Instances | Purpose |
| --- | ---: | --- |
| `aws_cognito_user_pool.this` | 1 | Email/password signup, verified email, recovery, post-confirmation trigger, Essentials tier |
| `aws_cognito_identity_provider.google` | 1 | Google sign-in, variable-supplied client ID/secret |
| `aws_cognito_resource_server.api` | 1 | `predictarena/api` OAuth scope |
| `aws_cognito_user_pool_client.browser` | 1 | Public code-flow browser client, no secret, configurable callbacks/logout |
| `aws_cognito_user_pool_domain.this` | 1 | Configurable Cognito managed-login domain prefix |
| `aws_cognito_managed_login_branding.browser` | 1 | AWS-provided managed-login appearance |
| `aws_apigatewayv2_api.this` | 1 | HTTP API with exact CORS origins |
| `aws_apigatewayv2_authorizer.cognito` | 1 | Cognito issuer, app-client audience, JWT authorizer |
| `aws_apigatewayv2_stage.this` | 1 | Auto-deploy `$default` stage, throttling, detailed metrics, access logging |
| `aws_cloudwatch_log_group.api` | 1 | `/aws/apigateway/predictarena-<stage>` |

## Every HTTP route and its resources

Each row below creates exactly one of each: `aws_apigatewayv2_route.route`, `aws_apigatewayv2_integration.route`, `aws_lambda_function.route`, `aws_iam_role.route`, `aws_iam_role_policy.route`, `aws_lambda_permission.route` and `aws_cloudwatch_log_group.route`. Their Terraform instance key is the route ID. The function/role name is `predictarena-<stage>-<route-id>`, inline policy is `runtime`, log group is `/aws/lambda/predictarena-<stage>-<route-id>`. Roles live under `/predictarena/<stage>/` and use the bootstrap-owned permissions boundary. Permissions authorize only the matching API method/path to invoke that function.

| Route ID | HTTP route | Access | Runtime data permissions |
| --- | --- | --- | --- |
| `competitions-list` | `GET /v1/competitions` | Public | None |
| `fixtures-list` | `GET /v1/fixtures` | Public | None |
| `fixture-get` | `GET /v1/fixtures/{fixtureId}` | Public | None |
| `standings-list` | `GET /v1/standings/{sport}/{competitionId}` | Public | None |
| `football-list` | `GET /v1/predictions/football` | Logged in | Users GetItem |
| `basketball-list` | `GET /v1/predictions/basketball` | Logged in | Users GetItem |
| `tennis-list` | `GET /v1/predictions/tennis` | Logged in | Users GetItem |
| `football-detail` | `GET /v1/predictions/football/{fixtureId}` | Premium | Users GetItem |
| `basketball-detail` | `GET /v1/predictions/basketball/{fixtureId}` | Premium | Users GetItem |
| `tennis-detail` | `GET /v1/predictions/tennis/{fixtureId}` | Premium | Users GetItem |
| `profile-get` | `GET /v1/me` | Logged in | Users GetItem/PutItem; AdminGetUser on this pool |
| `profile-patch` | `PATCH /v1/me` | Logged in | Users GetItem; update remains a stub |

All route roles may create streams and write events only inside their own log group. Private routes use JWT plus `predictarena/api`. Premium details additionally call the shared, strongly consistent entitlement helper. Public stubs have no DynamoDB permissions until a future reviewed integration needs them. OPTIONS is provided by Gateway CORS and has no Lambda or route resource of its own.

## Profile bootstrap per stage

| Terraform resource | Instances | Purpose |
| --- | ---: | --- |
| `aws_lambda_function.bootstrap` | 1 | `predictarena-<stage>-profile-bootstrap`, initializes confirmed verified users as free |
| `aws_iam_role.bootstrap` | 1 | Dedicated bounded execution role with the same function name |
| `aws_iam_role_policy.bootstrap` | 1 | `runtime`: PutItem on users and logs only |
| `aws_cloudwatch_log_group.bootstrap` | 1 | `/aws/lambda/predictarena-<stage>-profile-bootstrap` |
| `aws_lambda_permission.cognito` | 1 | Only this account and pool may invoke the trigger |

Totals per stage: 13 Lambdas, 13 execution roles, 13 inline runtime policies, 13 invocation permissions, 14 log groups, 12 HTTP routes and 12 integrations. Lambdas use bundled Node.js 22 code on arm64, 128 MiB memory, and 8-second route / 5-second trigger timeouts. Logs retain 14 days by default.

The archive data source creates a local ZIP; it is not an AWS resource. HTTP API logging may cause AWS to manage a log-delivery resource policy. No domain/DNS certificate, budget, SES identity, frontend, model worker, payment resource, event mapping, stream or EventBridge schedule is created. The GitHub workflow is an inactive file under `infra/workflows/`.
