variable "environment" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "app_security_group_id" {
  type = string
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
  type = number
}

variable "ai_desired_count" {
  type = number
}

variable "webhook_worker_desired_count" {
  type = number
}

variable "api_target_group_arn" {
  type = string
}

variable "ai_target_group_arn" {
  type = string
}

variable "webhook_worker_target_group_arn" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "redis_url" {
  type      = string
  sensitive = true
}

variable "models_bucket" {
  type = string
}

variable "ai_internal_url" {
  type    = string
  default = "http://retain-ai.internal:8000"
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

variable "log_group_name" {
  type = string
}
