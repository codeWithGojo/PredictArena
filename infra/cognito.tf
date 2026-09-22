resource "aws_cognito_user_pool" "this" {
  name                     = local.prefix
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.stage == "prod" ? "ACTIVE" : "INACTIVE"
  user_pool_tier           = "ESSENTIALS"
  username_configuration { case_sensitive = false }
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  user_attribute_update_settings { attributes_require_verification_before_update = ["email"] }
  verification_message_template { default_email_option = "CONFIRM_WITH_CODE" }
  email_configuration { email_sending_account = "COGNITO_DEFAULT" }
  lambda_config { post_confirmation = aws_lambda_function.bootstrap.arn }
}
resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"
  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }
  attribute_mapping = { email = "email", email_verified = "email_verified", name = "name" }
}
resource "aws_cognito_resource_server" "api" {
  identifier   = "predictarena"
  name         = "PredictArena API"
  user_pool_id = aws_cognito_user_pool.this.id
  scope {
    scope_name        = "api"
    scope_description = "Call authenticated PredictArena routes"
  }
}
resource "aws_cognito_user_pool_client" "browser" {
  name                                 = "${local.prefix}-browser"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile", "predictarena/api"]
  supported_identity_providers         = ["COGNITO", aws_cognito_identity_provider.google.provider_name]
  callback_urls                        = sort(tolist(var.callback_urls))
  logout_urls                          = sort(tolist(var.logout_urls))
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 15
  id_token_validity                    = 15
  refresh_token_validity               = 7
  read_attributes                      = ["email", "email_verified", "name"]
  write_attributes                     = ["email", "name"]
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
  depends_on = [aws_cognito_resource_server.api]
}
resource "aws_cognito_user_pool_domain" "this" {
  domain                = var.cognito_domain_prefix
  user_pool_id          = aws_cognito_user_pool.this.id
  managed_login_version = 2
}
resource "aws_cognito_managed_login_branding" "browser" {
  user_pool_id                = aws_cognito_user_pool.this.id
  client_id                   = aws_cognito_user_pool_client.browser.id
  use_cognito_provided_values = true
  depends_on                  = [aws_cognito_user_pool_domain.this]
}
resource "aws_lambda_permission" "cognito" {
  statement_id   = "CognitoPostConfirmation"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.bootstrap.function_name
  principal      = "cognito-idp.amazonaws.com"
  source_arn     = aws_cognito_user_pool.this.arn
  source_account = var.aws_account_id
}
