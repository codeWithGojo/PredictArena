variable "aws_region" { type = string }
variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply the intended 12-digit AWS account ID."
  }
}
variable "state_bucket_name" {
  type        = string
  description = "Globally unique private bucket for bootstrap/dev/prod state."
}
variable "github_repository" {
  type    = string
  default = "codeWithGojo/PredictArena"
  validation {
    condition     = var.github_repository == "codeWithGojo/PredictArena"
    error_message = "This foundation trusts only codeWithGojo/PredictArena."
  }
}
variable "existing_github_oidc_provider_arn" {
  type        = string
  default     = null
  description = "Reuse the GitHub OIDC provider if this account already has one."
}
