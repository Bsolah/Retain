environment = "production"
aws_region  = "us-east-1"
vpc_cidr    = "10.10.0.0/16"

acm_certificate_arn        = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/PRODUCTION-ALB-CERT"
cloudfront_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/PRODUCTION-CF-CERT"

api_domain    = "api.retain.app"
ai_domain     = "ai.retain.app"
admin_domain  = "admin.retain.app"
portal_domain = "portal.retain.app"

api_image            = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/retain-api:production"
ai_image             = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/retain-ai:production"
webhook_worker_image = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/retain-webhook-worker:production"

api_desired_count            = 3
ai_desired_count             = 2
webhook_worker_desired_count = 3

rds_instance_class = "db.r6g.xlarge"
rds_multi_az       = true
redis_node_type    = "cache.r6g.large"
redis_num_shards   = 2

pagerduty_endpoint = "https://events.pagerduty.com/integration/INTEGRATION_KEY/enqueue"

api_env = {
  SHOPIFY_APP_URL           = "https://admin.retain.app"
  ADMIN_APP_URL             = "https://admin.retain.app"
  PORTAL_URL                = "https://portal.retain.app"
  ARCHIVE_DELETE_FROM_SHOPIFY = "false"
  PROCESS_WEBHOOKS_IN_API   = "false"
}

ai_env = {
  ENABLE_SCHEDULER = "true"
}

worker_env = {}
