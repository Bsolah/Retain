terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "retain-terraform-state"
    key            = "retain/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "retain-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "retain"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  api_service_name    = "retain-${var.environment}-api"
  ai_service_name     = "retain-${var.environment}-ai"
  worker_service_name = "retain-${var.environment}-webhook-worker"
}

module "vpc" {
  source = "./modules/vpc"

  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 3)
}

module "logging" {
  source = "./modules/logging"

  environment = var.environment
}

module "s3" {
  source = "./modules/s3"

  environment = var.environment
  account_id  = data.aws_caller_identity.current.account_id
}

module "iam" {
  source = "./modules/iam"

  environment          = var.environment
  account_id           = data.aws_caller_identity.current.account_id
  models_bucket_arn    = module.s3.models_bucket_arn
  datalake_bucket_arn  = module.s3.datalake_bucket_arn
  cloudwatch_log_group = module.logging.log_group_arn
}

module "alb" {
  source = "./modules/alb"

  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  certificate_arn   = var.acm_certificate_arn
  api_domain        = var.api_domain
  ai_domain         = var.ai_domain
}

module "rds" {
  source = "./modules/rds"

  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  allowed_security_groups = [module.vpc.app_security_group_id]
  instance_class          = var.rds_instance_class
  multi_az                = var.rds_multi_az
  db_name                 = var.db_name
  db_username             = var.db_username
}

module "elasticache" {
  source = "./modules/elasticache"

  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  allowed_security_groups = [module.vpc.app_security_group_id]
  node_type               = var.redis_node_type
  num_node_groups         = var.redis_num_shards
}

module "cloudfront" {
  source = "./modules/cloudfront"

  environment         = var.environment
  admin_domain        = var.admin_domain
  portal_domain       = var.portal_domain
  admin_bucket_name   = module.s3.admin_static_bucket_name
  portal_bucket_name  = module.s3.portal_static_bucket_name
  acm_certificate_arn = var.cloudfront_certificate_arn
}

module "ecs" {
  source = "./modules/ecs"

  environment           = var.environment
  aws_region            = var.aws_region
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  alb_security_group_id = module.alb.security_group_id
  app_security_group_id = module.vpc.app_security_group_id

  api_image            = var.api_image
  ai_image             = var.ai_image
  webhook_worker_image = var.webhook_worker_image

  api_desired_count            = var.api_desired_count
  ai_desired_count             = var.ai_desired_count
  webhook_worker_desired_count = var.webhook_worker_desired_count

  api_target_group_arn            = module.alb.api_target_group_arn
  ai_target_group_arn             = module.alb.ai_target_group_arn
  webhook_worker_target_group_arn = module.alb.worker_target_group_arn

  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn

  database_url  = module.rds.connection_string
  redis_url     = module.elasticache.connection_string
  models_bucket = module.s3.models_bucket_name
  ai_internal_url = "https://${var.ai_domain}"

  api_env    = var.api_env
  ai_env     = var.ai_env
  worker_env = var.worker_env

  log_group_name = module.logging.log_group_name
}

module "cloudwatch" {
  source = "./modules/cloudwatch"

  environment             = var.environment
  pagerduty_endpoint      = var.pagerduty_endpoint
  api_service_name        = local.api_service_name
  ai_service_name         = local.ai_service_name
  worker_service_name     = local.worker_service_name
  ecs_cluster_name        = module.ecs.cluster_name
  rds_instance_id         = module.rds.instance_id
  redis_replication_group = module.elasticache.replication_group_id
  alb_arn_suffix          = module.alb.alb_arn_suffix
  api_target_group_suffix = module.alb.api_target_group_arn_suffix
}
