# Phase 1 validation record

Date: 2026-09-20. Terraform 1.10.5 on linux_amd64. Contract base: main `5849c6ca09d62fbc5eeb7eafe1c309c3a1adbc19`.

## Results

| Check | Result |
| --- | --- |
| `npm install --ignore-scripts` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `terraform fmt -check -recursive -diff` inside infra | Passed, exit 0, no output |
| `terraform init -backend=false -input=false -no-color` inside infra | Passed, signed AWS 6.65.0 and archive 2.8.1 installed |
| `terraform validate -no-color` inside infra | Blocked, exit 1: providers cannot create a Unix socket in this sandbox |
| Bootstrap init using the already downloaded provider directory | Passed, initially warned about locally calculated platform checksums |
| Bootstrap `terraform providers lock -platform=linux_amd64` | Passed, retrieved signed HashiCorp checksums; complete registry hash list committed |
| Bootstrap `terraform validate -no-color` | Blocked by the same plugin socket restriction |
| Offline Lambda behavioral checks | 35 passed with AWS SDK calls mocked |

The offline checks covered all 12 routes, response envelopes/cache headers, public roles making no data calls, strongly consistent profile reads, active/free/expired/revoked/malformed entitlements, missing profiles and storage failures, invalid token/client/scope/sub, wrong-sport IDs, production/default specimen isolation, per-request revocation, conditional verified profile creation/repair and password-reset trigger exclusion. They ran from a temporary external harness; no tests outside infra were committed. They do not verify AWS IAM, provider schemas, live Cognito or deployment behavior.

No AWS plan/apply was run. Terraform validation has NOT passed. Successful formatting and initialization must not be read as a successful validation. Re-run validation in a normal local environment or the staged CI job before applying.

## Minimal recovery and changes

The first validate attempt detected a checksum mismatch. Inspection found an extra interrupted-download temporary file alongside the signed AWS provider. Moving only that incomplete temporary file out of the provider cache resolved the mismatch. The lock hashes and provider binary were not altered or bypassed. Validation then reached provider startup, where the sandbox denied local Unix sockets. A trace run confirmed the cause. Further validation retries stopped.

No Terraform configuration or IAM changes were made to work around validation failures. Provider lock files, environment examples and handoff documentation were added after the implementation checkpoint. Bootstrap's registry lock command supplied signed cross-platform archive hashes after the local-cache initialization warning.

## Root init output, exit 0

```text
Initializing provider plugins...
- Finding hashicorp/aws versions matching "~> 6.65.0"...
- Finding hashicorp/archive versions matching "~> 2.8.1"...
- Installing hashicorp/aws v6.65.0...
- Installed hashicorp/aws v6.65.0 (signed by HashiCorp)
- Installing hashicorp/archive v2.8.1...
- Installed hashicorp/archive v2.8.1 (signed by HashiCorp)
Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

## First root validate output, exit 1

```text
Error: registry.terraform.io/hashicorp/aws: the cached package for registry.terraform.io/hashicorp/aws 6.65.0 (in .terraform/providers) does not match any of the checksums recorded in the dependency lock file
```

## Root validate after removing the incomplete cache file, exit 1

```text
Error: Failed to load plugin schemas

Error while loading schemas for plugin components: 2 problems:

- Failed to obtain provider schema: Could not load the schema for provider
registry.terraform.io/hashicorp/archive: failed to instantiate provider
"registry.terraform.io/hashicorp/archive" to obtain schema: Unrecognized
remote plugin message: 
Failed to read any lines from plugin's stdout
This usually means
  the plugin was not compiled for this architecture,
  the plugin is missing dynamic-link libraries necessary to run,
  the plugin is not executable by this process due to file permissions, or
  the plugin failed to negotiate the initial go-plugin protocol handshake

Additional notes about plugin:
  Path: .terraform/providers/registry.terraform.io/hashicorp/archive/2.8.1/linux_amd64/terraform-provider-archive_v2.8.1_x5
  Mode: -rwxr-xr-x
  Owner: 0 [root] (current: 0 [root])
  Group: 0 [root] (current: 0 [root])
  ELF architecture: EM_X86_64 (current architecture: amd64)
.
- Failed to obtain provider schema: Could not load the schema for provider
registry.terraform.io/hashicorp/aws: failed to instantiate provider
"registry.terraform.io/hashicorp/aws" to obtain schema: Unrecognized remote
plugin message: 
Failed to read any lines from plugin's stdout
This usually means
  the plugin was not compiled for this architecture,
  the plugin is missing dynamic-link libraries necessary to run,
  the plugin is not executable by this process due to file permissions, or
  the plugin failed to negotiate the initial go-plugin protocol handshake

Additional notes about plugin:
  Path: .terraform/providers/registry.terraform.io/hashicorp/aws/6.65.0/linux_amd64/terraform-provider-aws_v6.65.0_x5
  Mode: -rwxr-xr-x
  Owner: 0 [root] (current: 0 [root])
  Group: 0 [root] (current: 0 [root])
  ELF architecture: EM_X86_64 (current architecture: amd64)
..
```

## Bootstrap validate output, exit 1

```text
Error: Failed to load plugin schemas

Error while loading schemas for plugin components: Failed to obtain provider
schema: Could not load the schema for provider
registry.terraform.io/hashicorp/aws: failed to instantiate provider
"registry.terraform.io/hashicorp/aws" to obtain schema: Unrecognized remote
plugin message: 
Failed to read any lines from plugin's stdout
This usually means
  the plugin was not compiled for this architecture,
  the plugin is missing dynamic-link libraries necessary to run,
  the plugin is not executable by this process due to file permissions, or
  the plugin failed to negotiate the initial go-plugin protocol handshake

Additional notes about plugin:
  Path: .terraform/providers/registry.terraform.io/hashicorp/aws/6.65.0/linux_amd64/terraform-provider-aws_v6.65.0_x5
  Mode: -rwxr-xr-x
  Owner: 0 [root] (current: 0 [root])
  Group: 0 [root] (current: 0 [root])
  ELF architecture: EM_X86_64 (current architecture: amd64)
..
```

## Bootstrap init output, exit 0 with warning

```text
Initializing provider plugins...
- Finding hashicorp/aws versions matching "~> 6.65.0"...
- Installing hashicorp/aws v6.65.0...
- Installed hashicorp/aws v6.65.0 (unauthenticated)
Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.


Warning: Incomplete lock file information for providers

Due to your customized provider installation methods, Terraform was forced to
calculate lock file checksums locally for the following providers:
  - hashicorp/aws

The current .terraform.lock.hcl file only includes checksums for linux_amd64,
so Terraform running on another platform will fail to install these
providers.

To calculate additional checksums for another platform, run:
  terraform providers lock -platform=linux_amd64
(where linux_amd64 is the platform to generate)
Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

## Bootstrap signed provider lock output, exit 0

```text
- Fetching hashicorp/aws 6.65.0 for linux_amd64...
- Retrieved hashicorp/aws 6.65.0 for linux_amd64 (signed by HashiCorp)
- Obtained hashicorp/aws checksums for linux_amd64; Additional checksums for this platform are now tracked in the lock file

Success! Terraform has updated the lock file.

Review the changes in .terraform.lock.hcl and then commit to your
version control system to retain the new checksums.
```

## Diagnostic cause from Terraform trace

```text
2026-09-20T13:58:32.889+0300 [ERROR] provider.terraform-provider-archive_v2.8.1_x5: plugin init error: error="listen unix /tmp/plugin460091280: socket: operation not permitted" timestamp="2026-09-20T13:58:32.889+0300"
2026-09-20T13:58:33.105+0300 [ERROR] provider.terraform-provider-aws_v6.65.0_x5: plugin init error: error="listen unix /tmp/plugin2381283775: socket: operation not permitted" timestamp="2026-09-20T13:58:33.105+0300"
```
