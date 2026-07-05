# Retain Terraform — AWS ECS Fargate

Provisions VPC, ECS Fargate (API, AI, Webhook Worker), ALB, CloudFront, RDS PostgreSQL 15, ElastiCache Redis 7, S3, IAM, and CloudWatch alarms.

## Layout

```
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── environments/
│   ├── staging/terraform.tfvars
│   └── production/terraform.tfvars
└── modules/
    ├── vpc/          # VPC, subnets, NAT, app security group
    ├── logging/      # CloudWatch log group (early)
    ├── s3/           # Models, datalake, static buckets
    ├── iam/          # ECS execution + task roles
    ├── alb/          # HTTPS ALB + target groups
    ├── rds/          # PostgreSQL 15 Multi-AZ
    ├── elasticache/  # Redis 7 cluster mode
    ├── cloudfront/   # Admin + portal CDN (OAC bucket policies)
    ├── ecs/          # Fargate cluster + services
    └── cloudwatch/   # SNS → PagerDuty alarms (late)
```

## Usage

```bash
cd infra/terraform
terraform init

# Staging
terraform plan -var-file=environments/staging/terraform.tfvars
terraform apply -var-file=environments/staging/terraform.tfvars

# Production — update image tags and secrets first
terraform apply -var-file=environments/production/terraform.tfvars
```

Replace placeholder values in `terraform.tfvars`:

- `ACCOUNT_ID`, ACM certificate ARNs, domain names
- ECR image URIs (set by CI)
- `pagerduty_endpoint`

## Secrets

Sensitive values (`JWT_SECRET`, `SHOPIFY_API_SECRET`, etc.) should be stored in AWS Secrets Manager and referenced in ECS task definitions. The current module passes `DATABASE_URL` and `REDIS_URL` from Terraform outputs; extend `modules/ecs` to use `secrets` blocks for app credentials.

## State

Remote state in `s3://retain-terraform-state` with DynamoDB locking. Bootstrap these resources before first `terraform init`.

## Deploy workflow

See [../RUNBOOK.md](../RUNBOOK.md) for full staging/production procedures.
