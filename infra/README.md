# PredictArena infrastructure: Phase 1

Source of truth: `docs/API_CONTRACT.md` on main at `5849c6ca09d62fbc5eeb7eafe1c309c3a1adbc19`. Changes are confined to `infra/`. This foundation has not been applied to AWS. [RESOURCES.md](RESOURCES.md) lists every resource; [SECURITY.md](SECURITY.md) explains security boundaries and remaining verification. [VALIDATION.md](VALIDATION.md) records checks and full failure output. Local validate is blocked by this sandbox denying provider Unix sockets, so it must pass elsewhere before deployment.

Phase 1 includes remote state, CI OIDC roles, staged workflow, Cognito email/password and optional Google sign-in, HTTP API, five tables, twelve route Lambdas and a profile-bootstrap trigger. It creates no slips/bets/billing/operations tables, payment routes, streams or EventBridge resources. The existing users schema retains its nullable entitlement/provider fields without implementing billing.

An operator can grant a verified owner account Premium without billing after the pool, API and users table are deployed. Have the owner sign up, verify the email and sign in once to create the profile. With short-lived AWS operator credentials and the correct stage selected, run `COGNITO_USER_POOL_ID=<pool-id> USERS_TABLE=<users-table> node infra/scripts/grant-owner.mjs owner@example.com`. The script matches one enabled, email-verified Cognito user to its existing profile and conditionally sets `ownerAccess=true`; it does not create a subscription. API authorization still reads DynamoDB for every Premium request and honors `entitlementRevoked`. Keep this command out of public routes and CI. For revocation, an operator must set `ownerAccess=false` on that profile; disabling the Cognito user also prevents new sign-ins, but existing tokens may remain valid until expiry.

`GET /me` reads the actual authenticated user's profile and can repair a missing profile from verified Cognito identity. Premium details always check actual stored entitlement. `PATCH /me` is a reserved stub: it checks authentication/profile/version and returns a retryable contract error without writing anything. Sports routes return `503 DATA_UNAVAILABLE` until connected. For transport previews, `stub_responses=true` enables static success specimens in dev only, marked `X-PredictArena-Stub: true` and never cached. Predictions honestly use `insufficient_data`, null estimates and `NO_HISTORY`; no model runs. Only `*:stub:123` fixture specimens exist, and lists can be empty outside the specimen date range. These examples are not live fixtures, rankings or predictive results.

## 1. AWS account and local prerequisites

Use Terraform 1.10.5, Node.js 22 and AWS CLI credentials from IAM Identity Center/SSO or another short-lived role. Do not create long-lived AWS keys for GitHub. Select the account and region deliberately; both roots check the account ID. Use only Terraform's default workspace; dev and prod are isolated by variables, names and backend keys.

In the AWS console, set up the bootstrap operator's short-lived access if needed, select the target account/region and create an AWS Budget notification. Check whether the account already has the `token.actions.githubusercontent.com` IAM OIDC provider; reuse its ARN rather than creating a duplicate.

## 2. Bootstrap once

Create ignored `infra/bootstrap/bootstrap.auto.tfvars` with your `aws_region`, `aws_account_id`, globally unique `state_bucket_name`, and optionally `existing_github_oidc_provider_arn`. Review the OIDC trust and bootstrap IAM policies, then run:

```sh
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=infra/bootstrap apply bootstrap.tfplan
terraform -chdir=infra/bootstrap output
```

Bootstrap initially uses local state because it creates the remote bucket. Migrate it immediately, keeping a secure recovery copy until confirmed:

```sh
cp infra/bootstrap/backend.tf.example infra/bootstrap/backend.tf
terraform -chdir=infra/bootstrap init -migrate-state \
  -backend-config="bucket=YOUR_STATE_BUCKET" \
  -backend-config="key=bootstrap/terraform.tfstate" \
  -backend-config="region=YOUR_REGION"
```

Remove local state backups and saved plans securely after confirming migration. Bootstrap state and IAM are operator-managed, outside CI permissions. Do not apply bootstrap automatically on PRs. Later bootstrap changes require a separate operator plan/apply.

## 3. Deploy dev and optionally configure Google

1. Email/password sign-in works without Google credentials. To add Google, configure an OAuth consent screen and web OAuth client. Add `https://<domain-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse` as its authorized redirect URI. If the consent screen is in testing, add your test users. Choose separate dev/prod clients and domain prefixes.
2. Copy `environments/dev.example.tfvars` and `dev.example.tfbackend` to ignored `dev.tfvars` and `dev.tfbackend` in the same folder. Replace all placeholders, using bootstrap's boundary ARN and bucket output. Set exact HTTPS frontend origins, callbacks ending in `/auth/callback` and logout URLs ending in `/`.
3. If using Google, set `enable_google=true` in the stage tfvars and supply both values via a local secret environment: `TF_VAR_google_client_id` and `TF_VAR_google_client_secret`. Never put secrets in command arguments, committed tfvars or screenshots. Terraform state will contain the Google secret, as explained in SECURITY.md.
4. From the repository root:

```sh
npm ci --prefix infra --ignore-scripts
npm run typecheck --prefix infra
npm run build --prefix infra
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -reconfigure -backend-config=environments/dev.tfbackend
terraform -chdir=infra validate
terraform -chdir=infra plan -var-file=environments/dev.tfvars -out=foundation.tfplan
terraform -chdir=infra apply foundation.tfplan
terraform -chdir=infra output
```

Repeat with prod files after verifying dev. Use a separate checkout or run `init -reconfigure` when changing stage. Never point prod variables at dev state. Build before plan so the Lambda ZIP exists. Review destructive/replacement actions before approving any plan. No apply is required just to run `init -backend=false` and `validate` locally.

## 4. Connect and verify identity

Give the frontend owner the outputs for API base URL, Cognito domain, app client ID and pool ID. Frontend uses OAuth code flow with PKCE S256, state and nonce, requests `openid email profile predictarena/api`, and sends the access token to the API. Terraform configures the public code-flow client; the frontend must generate and verify PKCE/state/nonce correctly. Tokens remain out of localStorage as the contract specifies. Before a future merge, the frontend owner must exclude `infra/` from the root TypeScript build. This branch does not change frontend files.

Verify password signup, email confirmation, recovery, logout, refresh, GET /me, rejection of ID tokens, expired/revoked/free entitlements and database failures in dev. Verify Google sign-in when enabled. Use dedicated test users. No API can grant premium in Phase 1. Premium integration tests need an operator-provisioned test entitlement in dev; do not alter production entitlements for tests.

The pool currently uses Cognito's default email sender. In the AWS console, verify its delivery limits. Before production volume, configure a verified SES sender/domain and request SES production access if necessary, then change the sender through Terraform in a later reviewed change. Do not hand-edit Terraform-managed pool/API/table/IAM settings in the console.

## 5. Activate CI only when ready

`infra/workflows/infra.yml` is staged and inactive. The repository owner must later copy it to `.github/workflows/infra.yml`. No workflow is activated or production deployment triggered by this branch.

Before activation, create GitHub environments `dev` and `prod` with required reviewers, prevent self-review/admin bypass and restrict deployments to main and explicitly reviewed internal PR merge refs. Review the entire PR before granting environment access. Fork PRs receive offline checks only. If the repository's GitHub plan cannot enforce required reviewers, leave cloud-authenticated PR jobs disabled and use operator-reviewed deployments. Protect main and require review of Terraform/workflow changes.

Set these environment-specific values:

| Kind | Names |
| --- | --- |
| Variables | `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_ROLE_ARN` (apply role), `AWS_PLAN_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_STATE_KEY`, `RUNTIME_PERMISSIONS_BOUNDARY_ARN`, `COGNITO_DOMAIN_PREFIX` |
| JSON-array variables | `ALLOWED_ORIGINS`, `COGNITO_CALLBACK_URLS`, `COGNITO_LOGOUT_URLS` |
| Secrets | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

The matrix fixes STAGE to dev/prod and validates `<stage>/terraform.tfstate`. Reviewed same-repo PRs plan with a read role; main plans and applies with the deploy role after environment approval. Plans stay on the ephemeral runner and are deleted, never uploaded as artifacts. Bootstrap is not deployed by this workflow.

## Costs

There is no always-on server, VPC/NAT gateway or provisioned concurrency. Costs depend on API requests, Lambda duration, DynamoDB on-demand requests/storage/PITR, Cognito Essentials active users, CloudWatch logs/metrics and S3 versions/requests. Five PITR-enabled tables per stage and retained state versions can incur storage charges even at low traffic. Logs expire after 14 days by default. Both stages incur their own usage charges. Use the AWS pricing calculator for your chosen region and expected usage; no fixed cost or free-tier guarantee is assumed. Account budgets are manual, not provisioned here.
