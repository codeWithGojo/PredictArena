locals {
  stages = toset(["dev", "prod"])
  arn    = "arn:${data.aws_partition.current.partition}"
  oidc   = var.existing_github_oidc_provider_arn != null ? var.existing_github_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  roles  = { for p in setproduct(local.stages, ["plan", "apply"]) : "${p[0]}-${p[1]}" => { stage = p[0], mode = p[1] } }
  tables = ["users", "fixtures", "predictions", "catalog", "standings"]
}

resource "aws_s3_bucket" "state" {
  bucket        = var.state_bucket_name
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.existing_github_oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

// Bootstrap owns the maximum runtime permissions; CI cannot modify these policies.
resource "aws_iam_policy" "runtime_boundary" {
  for_each = local.stages
  name     = "predictarena-${each.key}-runtime-boundary"
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${local.arn}:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/predictarena-${each.key}-*:*" },
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem"], Resource = "${local.arn}:dynamodb:${var.aws_region}:${var.aws_account_id}:table/predictarena-${each.key}-users" },
    { Effect = "Allow", Action = ["cognito-idp:AdminGetUser"], Resource = "${local.arn}:cognito-idp:${var.aws_region}:${var.aws_account_id}:userpool/*" }
  ] })
}
resource "aws_iam_role" "github" {
  for_each             = local.roles
  name                 = "predictarena-${each.key}"
  max_session_duration = 3600
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = "sts:AssumeRoleWithWebIdentity", Principal = { Federated = local.oidc },
    Condition = { StringEquals = {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${each.value.stage}"
    } }
  }] })
}
resource "aws_iam_role_policy" "state" {
  for_each = local.roles
  name     = "state"
  role     = aws_iam_role.github[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.state.arn,
    Condition = { StringLike = { "s3:prefix" = ["${each.value.stage}/terraform.tfstate", "${each.value.stage}/terraform.tfstate.tflock", "env:/"] } } },
    { Effect = "Allow", Action = each.value.mode == "apply" ? ["s3:GetObject", "s3:PutObject"] : ["s3:GetObject"], Resource = "${aws_s3_bucket.state.arn}/${each.value.stage}/terraform.tfstate" },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.state.arn}/${each.value.stage}/terraform.tfstate.tflock" }
  ] })
}
resource "aws_iam_role_policy" "read" {
  for_each = local.roles
  name     = "read-foundation"
  role     = aws_iam_role.github[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["dynamodb:DescribeTable", "dynamodb:DescribeContinuousBackups", "dynamodb:DescribeTimeToLive", "dynamodb:ListTagsOfResource"], Resource = [for t in local.tables : "${local.arn}:dynamodb:${var.aws_region}:${var.aws_account_id}:table/predictarena-${each.value.stage}-${t}"] },
    { Effect = "Allow", Action = ["lambda:GetFunction", "lambda:GetFunctionCodeSigningConfig", "lambda:GetPolicy", "lambda:ListVersionsByFunction", "lambda:ListTags"], Resource = "${local.arn}:lambda:${var.aws_region}:${var.aws_account_id}:function:predictarena-${each.value.stage}-*" },
    { Effect = "Allow", Action = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole"], Resource = "${local.arn}:iam::${var.aws_account_id}:role/predictarena/${each.value.stage}/predictarena-${each.value.stage}-*" },
    { Effect = "Allow", Action = ["logs:DescribeLogGroups"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } } },
    { Effect = "Allow", Action = ["logs:ListTagsForResource", "logs:ListTagsLogGroup"], Resource = ["${local.arn}:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/predictarena-${each.value.stage}-*", "${local.arn}:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/apigateway/predictarena-${each.value.stage}*"] },
    { Effect = "Allow", Action = ["cognito-idp:DescribeUserPool", "cognito-idp:DescribeUserPoolClient", "cognito-idp:DescribeIdentityProvider", "cognito-idp:DescribeResourceServer", "cognito-idp:DescribeManagedLoginBranding", "cognito-idp:DescribeManagedLoginBrandingByClient", "cognito-idp:ListTagsForResource"], Resource = "${local.arn}:cognito-idp:${var.aws_region}:${var.aws_account_id}:userpool/*" },
    { Effect = "Allow", Action = ["cognito-idp:DescribeUserPoolDomain"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } } },
    { Effect = "Allow", Action = ["apigateway:GET"], Resource = ["${local.arn}:apigateway:${var.aws_region}::/apis", "${local.arn}:apigateway:${var.aws_region}::/apis/*", "${local.arn}:apigateway:${var.aws_region}::/tags/*"] }
  ] })
}
resource "aws_iam_role_policy" "apply" {
  for_each = local.stages
  name     = "deploy-foundation"
  role     = aws_iam_role.github["${each.key}-apply"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["dynamodb:CreateTable", "dynamodb:UpdateTable", "dynamodb:DeleteTable", "dynamodb:UpdateContinuousBackups", "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource"], Resource = [for t in local.tables : "${local.arn}:dynamodb:${var.aws_region}:${var.aws_account_id}:table/predictarena-${each.key}-${t}"] },
    { Effect = "Allow", Action = ["lambda:CreateFunction", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:DeleteFunction", "lambda:AddPermission", "lambda:RemovePermission", "lambda:TagResource", "lambda:UntagResource"], Resource = "${local.arn}:lambda:${var.aws_region}:${var.aws_account_id}:function:predictarena-${each.key}-*" },
    { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy", "logs:TagResource", "logs:UntagResource", "logs:TagLogGroup", "logs:UntagLogGroup"], Resource = ["${local.arn}:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/predictarena-${each.key}-*", "${local.arn}:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/apigateway/predictarena-${each.key}*"] },
    { Effect = "Allow", Action = ["logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } } },
    { Effect = "Allow", Action = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"], Resource = "${local.arn}:iam::${var.aws_account_id}:role/predictarena/${each.key}/predictarena-${each.key}-*", Condition = { StringEquals = { "iam:PermissionsBoundary" = aws_iam_policy.runtime_boundary[each.key].arn } } },
    { Effect = "Allow", Action = ["iam:DeleteRole", "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:TagRole", "iam:UntagRole"], Resource = "${local.arn}:iam::${var.aws_account_id}:role/predictarena/${each.key}/predictarena-${each.key}-*" },
    { Effect = "Allow", Action = ["iam:PassRole"], Resource = "${local.arn}:iam::${var.aws_account_id}:role/predictarena/${each.key}/predictarena-${each.key}-*", Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } } },
    { Effect = "Allow", Action = ["cognito-idp:CreateUserPool"], Resource = "*", Condition = { StringEquals = { "aws:RequestTag/Project" = "PredictArena", "aws:RequestTag/Stage" = each.key } } },
    { Effect = "Allow", Action = ["cognito-idp:UpdateUserPool", "cognito-idp:DeleteUserPool", "cognito-idp:CreateUserPoolClient", "cognito-idp:UpdateUserPoolClient", "cognito-idp:DeleteUserPoolClient", "cognito-idp:CreateIdentityProvider", "cognito-idp:UpdateIdentityProvider", "cognito-idp:DeleteIdentityProvider", "cognito-idp:CreateResourceServer", "cognito-idp:UpdateResourceServer", "cognito-idp:DeleteResourceServer", "cognito-idp:CreateUserPoolDomain", "cognito-idp:UpdateUserPoolDomain", "cognito-idp:DeleteUserPoolDomain", "cognito-idp:CreateManagedLoginBranding", "cognito-idp:UpdateManagedLoginBranding", "cognito-idp:DeleteManagedLoginBranding", "cognito-idp:TagResource", "cognito-idp:UntagResource"], Resource = "${local.arn}:cognito-idp:${var.aws_region}:${var.aws_account_id}:userpool/*", Condition = { StringEquals = { "aws:ResourceTag/Project" = "PredictArena", "aws:ResourceTag/Stage" = each.key } } },
    { Effect = "Allow", Action = ["apigateway:POST"], Resource = "${local.arn}:apigateway:${var.aws_region}::/apis", Condition = { StringEquals = { "aws:RequestTag/Project" = "PredictArena", "aws:RequestTag/Stage" = each.key } } },
    { Effect = "Allow", Action = ["apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"], Resource = ["${local.arn}:apigateway:${var.aws_region}::/apis/*", "${local.arn}:apigateway:${var.aws_region}::/tags/*"] }
  ] })
}
