variable "environment" {
  type        = string
  description = "Deployment environment (staging | production)"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for ALB (must be in the same region)"
}

variable "cloudfront_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for CloudFront (must be in us-east-1)"
}

variable "api_domain" {
  type = string
}

variable "ai_domain" {
  type = string
}

variable "admin_domain" {
  type = string
}

variable "portal_domain" {
  type = string
}

variable "rds_instance_class" {
  type    = string
  default = "db.r6g.xlarge"
}

variable "rds_multi_az" {
  type    = bool
  default = true
}

variable "db_name" {
  type    = string
  default = "retain"
}

variable "db_username" {
  type    = string
  default = "retain"
}

variable "redis_node_type" {
  type    = string
  default = "cache.r6g.large"
}

variable "redis_num_shards" {
  type    = number
  default = 2
}

variable "api_image" {
  type = string
}

variable "ai_image" {
  type = string
}

variable "webhook_worker_image" {
  type = string
}

variable "api_desired_count" {
  type    = number
  default = 3
}

variable "ai_desired_count" {
  type    = number
  default = 2
}

variable "webhook_worker_desired_count" {
  type    = number
  default = 3
}

variable "api_env" {
  type    = map(string)
  default = {}
}

variable "ai_env" {
  type    = map(string)
  default = {}
}

variable "worker_env" {
  type    = map(string)
  default = {}
}

variable "pagerduty_endpoint" {
  type        = string
  description = "PagerDuty Events API v2 integration URL"
  sensitive   = true
}
