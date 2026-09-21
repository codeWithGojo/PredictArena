terraform {
  required_version = ">= 1.10.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.65.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8.1"
    }
  }
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags { tags = { Project = "PredictArena", Stage = var.stage, ManagedBy = "Terraform" } }
}
locals { prefix = "predictarena-${var.stage}" }
