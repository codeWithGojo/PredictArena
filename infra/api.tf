locals { routes = { for r in jsondecode(file("${path.module}/routes.json")) : r.id => r } }

resource "aws_apigatewayv2_api" "this" {
  name          = local.prefix
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins     = sort(tolist(var.allowed_origins))
    allow_methods     = ["GET", "PATCH", "OPTIONS"]
    allow_headers     = ["authorization", "content-type", "if-match"]
    expose_headers    = ["etag", "x-request-id", "retry-after", "apigw-requestid", "x-predictarena-stub"]
    allow_credentials = false
    max_age           = 300
  }
}
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito-access-token"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.browser.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
  }
}
resource "aws_apigatewayv2_integration" "route" {
  for_each               = local.routes
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.route[each.key].invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}
resource "aws_apigatewayv2_route" "route" {
  for_each             = local.routes
  api_id               = aws_apigatewayv2_api.this.id
  route_key            = "${each.value.method} /v1${each.value.path}"
  target               = "integrations/${aws_apigatewayv2_integration.route[each.key].id}"
  authorization_type   = each.value.auth == "public" ? "NONE" : "JWT"
  authorizer_id        = each.value.auth == "public" ? null : aws_apigatewayv2_authorizer.cognito.id
  authorization_scopes = each.value.auth == "public" ? null : ["predictarena/api"]
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${local.prefix}"
  retention_in_days = var.log_retention_days
}
resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit   = var.stage == "prod" ? 100 : 20
    throttling_rate_limit    = var.stage == "prod" ? 50 : 10
    detailed_metrics_enabled = true
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format          = jsonencode({ requestId = "$context.requestId", routeKey = "$context.routeKey", status = "$context.status", responseLength = "$context.responseLength" })
  }
}
resource "aws_lambda_permission" "route" {
  for_each       = local.routes
  statement_id   = "ApiGatewayRoute"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.route[each.key].function_name
  principal      = "apigateway.amazonaws.com"
  source_account = var.aws_account_id
  source_arn     = "${aws_apigatewayv2_api.this.execution_arn}/*/${each.value.method}/v1${replace(each.value.path, "/\\{[^}]+\\}/", "*")}"
}
