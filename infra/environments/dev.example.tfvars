stage                            = "dev"
aws_region                       = "eu-west-1"
aws_account_id                   = "123456789012"
allowed_origins                  = ["https://dev.example.com"]
callback_urls                    = ["https://dev.example.com/auth/callback"]
logout_urls                      = ["https://dev.example.com/"]
cognito_domain_prefix            = "predictarena-dev-replace-me"
runtime_permissions_boundary_arn = "arn:aws:iam::123456789012:policy/predictarena-dev-runtime-boundary"
stub_responses                   = false
# Supply Google credentials through TF_VAR_google_client_id and TF_VAR_google_client_secret.
