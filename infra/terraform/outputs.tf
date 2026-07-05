output "vpc_id" {
  value = module.vpc.vpc_id
}

output "api_url" {
  value = "https://${var.api_domain}"
}

output "ai_url" {
  value = "https://${var.ai_domain}"
}

output "admin_url" {
  value = "https://${var.admin_domain}"
}

output "portal_url" {
  value = "https://${var.portal_domain}"
}

output "rds_endpoint" {
  value     = module.rds.endpoint
  sensitive = true
}

output "redis_configuration_endpoint" {
  value     = module.elasticache.configuration_endpoint
  sensitive = true
}

output "models_bucket" {
  value = module.s3.models_bucket_name
}

output "datalake_bucket" {
  value = module.s3.datalake_bucket_name
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "cloudfront_admin_distribution_id" {
  value = module.cloudfront.admin_distribution_id
}

output "cloudfront_portal_distribution_id" {
  value = module.cloudfront.portal_distribution_id
}

output "alerts_topic_arn" {
  value = module.cloudwatch.alerts_topic_arn
}

output "log_group_name" {
  value = module.logging.log_group_name
}
