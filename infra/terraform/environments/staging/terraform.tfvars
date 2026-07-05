environment = "staging"
aws_region  = "us-east-1"
vpc_cidr    = "10.20.0.0/16"

# Replace with your ACM certificate ARNs
acm_certificate_arn        = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/STAGING-ALB-CERT"
cloudfront_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/STAGING-CF-CERT"

api_domain    = "api.staging.retain.app"
ai_domain     = "ai.staging.retain.app"
admin_domain  = "admin.staging.retain.app"
portal_domain = "portal.staging.retain.app"

# ECR image tags — updated by CI on each deploy
api_image            = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/retain-api:staging"
ai_image             = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/retain-ai:staging"
webhook_worker_image = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/retain-webhook-worker:staging"

api_desired_count            = 2
ai_desired_count             = 1
webhook_worker_desired_count = 2

rds_instance_class = "db.r6g.large"
rds_multi_az       = true
redis_node_type    = "cache.r6g.large"
redis_num_shards   = 2

# PagerDuty Events API v2 integration URL (store in CI secrets)
pagerduty_endpoint = "https://events.pagerduty.com/integration/INTEGRATION_KEY/enqueue"

api_env = {
  SHOPIFY_APP_URL           = "https://admin.staging.retain.app"
  ADMIN_APP_URL             = "https://admin.staging.retain.app"
  PORTAL_URL                = "https://portal.staging.retain.app"
  ARCHIVE_DELETE_FROM_SHOPIFY = "false"
  PROCESS_WEBHOOKS_IN_API   = "false"
}

ai_env = {
  ENABLE_SCHEDULER = "true"
}

worker_env = {}
