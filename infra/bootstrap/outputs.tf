output "state_bucket" { value = aws_s3_bucket.state.id }
output "state_keys" { value = { for s in local.stages : s => "${s}/terraform.tfstate" } }
output "github_roles" { value = { for k, r in aws_iam_role.github : k => r.arn } }
output "runtime_boundaries" { value = { for k, p in aws_iam_policy.runtime_boundary : k => p.arn } }
