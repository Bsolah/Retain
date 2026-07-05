variable "environment" {
  type = string
}

variable "pagerduty_endpoint" {
  type      = string
  sensitive = true
}

variable "api_service_name" {
  type = string
}

variable "ai_service_name" {
  type = string
}

variable "worker_service_name" {
  type = string
}

variable "ecs_cluster_name" {
  type = string
}

variable "rds_instance_id" {
  type = string
}

variable "redis_replication_group" {
  type = string
}

variable "alb_arn_suffix" {
  type = string
}

variable "api_target_group_suffix" {
  type = string
}
