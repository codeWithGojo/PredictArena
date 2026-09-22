output "api_base_url" { value = "${aws_apigatewayv2_api.this.api_endpoint}/v1" }
output "cognito_user_pool_id" { value = aws_cognito_user_pool.this.id }
output "cognito_client_id" { value = aws_cognito_user_pool_client.browser.id }
output "cognito_domain" { value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com" }
output "google_redirect_uri" { value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse" }
output "table_names" { value = { for k, v in aws_dynamodb_table.this : k => v.name } }
output "table_arns" { value = { for k, v in aws_dynamodb_table.this : k => v.arn } }
output "lambda_arns" { value = { for k, v in aws_lambda_function.route : k => v.arn } }
output "routes" { value = local.routes }
