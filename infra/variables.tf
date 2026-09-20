variable "aws_region" { type = string }
variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply the intended 12-digit AWS account ID."
  }
}
variable "stage" {
  type = string
  validation {
    condition     = contains(["dev", "prod"], var.stage)
    error_message = "Use dev or prod and the corresponding isolated backend key."
  }
}
variable "allowed_origins" {
  type = set(string)
  validation {
    condition     = length(var.allowed_origins) > 0 && alltrue([for u in var.allowed_origins : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?$", u))])
    error_message = "Use exact HTTPS origins without paths, wildcards or trailing slashes."
  }
}
variable "callback_urls" {
  type = set(string)
  validation {
    condition     = length(var.callback_urls) > 0 && alltrue([for u in var.callback_urls : endswith(u, "/auth/callback") && contains(var.allowed_origins, trimsuffix(u, "/auth/callback"))])
    error_message = "Each callback must be <allowed-origin>/auth/callback."
  }
}
variable "logout_urls" {
  type = set(string)
  validation {
    condition     = length(var.logout_urls) > 0 && alltrue([for u in var.logout_urls : endswith(u, "/") && contains(var.allowed_origins, trimsuffix(u, "/"))])
    error_message = "Each logout must be <allowed-origin>/."
  }
}
variable "cognito_domain_prefix" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{2,61}[a-z0-9]$", var.cognito_domain_prefix))
    error_message = "Use a unique Cognito domain prefix, 4-63 lowercase letters, digits or hyphens."
  }
}
variable "google_client_id" {
  type      = string
  sensitive = true
  nullable  = false
  validation {
    condition     = length(trimspace(var.google_client_id)) > 0
    error_message = "Supply the Google client ID through TF_VAR_google_client_id."
  }
}
variable "google_client_secret" {
  type      = string
  sensitive = true
  nullable  = false
  validation {
    condition     = length(trimspace(var.google_client_secret)) > 0
    error_message = "Supply the Google secret through TF_VAR_google_client_secret."
  }
}
variable "runtime_permissions_boundary_arn" {
  type        = string
  description = "The stage's runtime boundary ARN from the bootstrap outputs."
}
variable "stub_responses" {
  type    = bool
  default = false
  validation {
    condition     = !var.stub_responses || var.stage == "dev"
    error_message = "Sample success responses are allowed only in dev."
  }
}
variable "log_retention_days" {
  type    = number
  default = 14
  validation {
    condition     = contains([7, 14, 30, 60, 90], var.log_retention_days)
    error_message = "Choose 7, 14, 30, 60 or 90 days."
  }
}
