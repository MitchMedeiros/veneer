# a small config
terraform {
  required_version = ">= 1.5"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

locals {
  tags = { Name = "demo", Env = var.region }
}

resource "aws_s3_bucket" "main" {
  bucket = "demo-${var.region}"
  tags   = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

output "arn" {
  value = aws_s3_bucket.main.arn
}

/* block */
data "aws_caller_identity" "me" {}
