data "archive_file" "handlers" {
  type        = "zip"
  source_dir  = "${path.module}/dist"
  output_path = "${path.module}/build/handlers.zip"
}
data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
resource "aws_cloudwatch_log_group" "route" {
  for_each          = local.routes
  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = var.log_retention_days
}
resource "aws_iam_role" "route" {
  for_each             = local.routes
  name                 = "${local.prefix}-${each.key}"
  path                 = "/predictarena/${var.stage}/"
  assume_role_policy   = data.aws_iam_policy_document.lambda_trust.json
  permissions_boundary = var.runtime_permissions_boundary_arn
}
data "aws_iam_policy_document" "route" {
  for_each = local.routes
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.route[each.key].arn}:*"]
  }
  dynamic "statement" {
    for_each = each.value.auth == "public" ? [] : [1]
    content {
      actions   = ["dynamodb:GetItem"]
      resources = [aws_dynamodb_table.this["users"].arn]
    }
  }
  dynamic "statement" {
    for_each = each.key == "profile-get" ? [1] : []
    content {
      actions   = ["dynamodb:PutItem"]
      resources = [aws_dynamodb_table.this["users"].arn]
    }
  }
  dynamic "statement" {
    for_each = each.key == "profile-get" ? [1] : []
    content {
      actions   = ["cognito-idp:AdminGetUser"]
      resources = [aws_cognito_user_pool.this.arn]
    }
  }
}
resource "aws_iam_role_policy" "route" {
  for_each = local.routes
  name     = "runtime"
  role     = aws_iam_role.route[each.key].id
  policy   = data.aws_iam_policy_document.route[each.key].json
}
resource "aws_lambda_function" "route" {
  for_each         = local.routes
  function_name    = "${local.prefix}-${each.key}"
  role             = aws_iam_role.route[each.key].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.handlers.output_path
  source_code_hash = data.archive_file.handlers.output_base64sha256
  memory_size      = 128
  timeout          = 8
  environment {
    variables = merge({
      STAGE = var.stage, LOG_LEVEL = "info", ROUTE_ID = each.key, STUB_RESPONSES = tostring(var.stub_responses)
      }, each.value.auth == "public" ? {} : {
      USERS_TABLE          = aws_dynamodb_table.this["users"].name,
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.this.id,
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.browser.id
    })
  }
  depends_on = [aws_iam_role_policy.route, aws_cloudwatch_log_group.route]
}

// Separate resource avoids a dependency cycle between the pool and its trigger.
resource "aws_cloudwatch_log_group" "bootstrap" {
  name              = "/aws/lambda/${local.prefix}-profile-bootstrap"
  retention_in_days = var.log_retention_days
}
resource "aws_iam_role" "bootstrap" {
  name                 = "${local.prefix}-profile-bootstrap"
  path                 = "/predictarena/${var.stage}/"
  assume_role_policy   = data.aws_iam_policy_document.lambda_trust.json
  permissions_boundary = var.runtime_permissions_boundary_arn
}
resource "aws_iam_role_policy" "bootstrap" {
  name = "runtime"
  role = aws_iam_role.bootstrap.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.bootstrap.arn}:*" },
    { Effect = "Allow", Action = ["dynamodb:PutItem"], Resource = aws_dynamodb_table.this["users"].arn }
  ] })
}
resource "aws_lambda_function" "bootstrap" {
  function_name    = "${local.prefix}-profile-bootstrap"
  role             = aws_iam_role.bootstrap.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "bootstrap.handler"
  filename         = data.archive_file.handlers.output_path
  source_code_hash = data.archive_file.handlers.output_base64sha256
  timeout          = 5
  memory_size      = 128
  environment {
    variables = { STAGE = var.stage, LOG_LEVEL = "info", USERS_TABLE = aws_dynamodb_table.this["users"].name }
  }
  depends_on = [aws_iam_role_policy.bootstrap, aws_cloudwatch_log_group.bootstrap]
}
