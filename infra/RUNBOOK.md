# Retain Deployment Runbook

Step-by-step procedures for staging and production deployments on AWS ECS Fargate, plus rollback and incident response.

---

## Prerequisites

- AWS CLI v2 configured with deploy role
- Terraform >= 1.6
- Docker + pnpm (for local builds)
- Access to ECR, Secrets Manager, Route53, PagerDuty
- `.env.staging` / `.env.production` secrets stored in AWS Secrets Manager

### One-time bootstrap

```bash
# S3 backend + DynamoDB lock table (run once per account)
aws s3 mb s3://retain-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name retain-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# ECR repositories
for repo in retain-api retain-ai retain-webhook-worker retain-admin retain-portal; do
  aws ecr create-repository --repository-name "$repo" --region us-east-1
done
```

---

## Staging Deploy

### 1. Build and push images

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
export TAG=staging-$(git rev-parse --short HEAD)

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$REGISTRY"

docker build -f apps/api/Dockerfile -t "$REGISTRY/retain-api:$TAG" .
docker build -f apps/ai/Dockerfile -t "$REGISTRY/retain-ai:$TAG" .
docker build -f apps/webhook-worker/Dockerfile -t "$REGISTRY/retain-webhook-worker:$TAG" .
docker build -f apps/admin/Dockerfile -t "$REGISTRY/retain-admin:$TAG" .
docker build -f apps/portal/Dockerfile -t "$REGISTRY/retain-portal:$TAG" .

for repo in retain-api retain-ai retain-webhook-worker retain-admin retain-portal; do
  docker push "$REGISTRY/$repo:$TAG"
done
```

### 2. Run database migrations

```bash
docker compose -f docker-compose.yml -f docker-compose.apps.yml \
  --profile migrate run --rm migrate
# Or against staging RDS via bastion / ECS one-off task:
# aws ecs run-task ... (migrate task using infra/docker/migrate.Dockerfile)
```

### 3. Deploy static assets to S3 + invalidate CloudFront

```bash
# Build admin/portal with staging API URLs, sync to S3 buckets from Terraform outputs
aws s3 sync apps/admin/dist/ s3://retain-staging-admin-${AWS_ACCOUNT_ID}/ --delete
aws s3 sync apps/portal/dist/ s3://retain-staging-portal-${AWS_ACCOUNT_ID}/ --delete

DIST_ADMIN=$(terraform -chdir=infra/terraform output -raw cloudfront_admin_distribution_id)
DIST_PORTAL=$(terraform -chdir=infra/terraform output -raw cloudfront_portal_distribution_id)
aws cloudfront create-invalidation --distribution-id "$DIST_ADMIN" --paths "/*"
aws cloudfront create-invalidation --distribution-id "$DIST_PORTAL" --paths "/*"
```

### 4. Apply Terraform

```bash
cd infra/terraform
terraform init
terraform plan \
  -var-file=environments/staging/terraform.tfvars \
  -var="api_image=$REGISTRY/retain-api:$TAG" \
  -var="ai_image=$REGISTRY/retain-ai:$TAG" \
  -var="webhook_worker_image=$REGISTRY/retain-webhook-worker:$TAG"

terraform apply \
  -var-file=environments/staging/terraform.tfvars \
  -var="api_image=$REGISTRY/retain-api:$TAG" \
  -var="ai_image=$REGISTRY/retain-ai:$TAG" \
  -var="webhook_worker_image=$REGISTRY/retain-webhook-worker:$TAG"
```

### 5. Force ECS rolling deploy (if only image changed)

```bash
CLUSTER=retain-staging
for svc in retain-staging-api retain-staging-ai retain-staging-webhook-worker; do
  aws ecs update-service --cluster "$CLUSTER" --service "$svc" --force-new-deployment
done
```

### 6. Smoke tests

```bash
curl -fsS https://api.staging.retain.app/health
curl -fsS https://ai.staging.retain.app/health
curl -fsS -o /dev/null -w "%{http_code}" https://admin.staging.retain.app/
curl -fsS -o /dev/null -w "%{http_code}" https://portal.staging.retain.app/
```

Check Datadog dashboards: API latency, webhook queue depth, no DLQ messages.

---

## Production Deploy

Production follows the same steps as staging with these differences:

1. **Change window:** Deploy Tue–Thu 10:00–14:00 UTC; avoid Fridays and peak billing windows.
2. **Approvals:** Require two approvers on the production Terraform apply.
3. **Image tag:** Use semver git tag (e.g. `v1.4.2`) not commit SHA.
4. **Tfvars:** `-var-file=environments/production/terraform.tfvars`
5. **Canary (recommended):** Scale API to 4 tasks, deploy 1 new task, verify metrics for 15 min, then complete rollout.

```bash
# Canary: set desired count temporarily
aws ecs update-service --cluster retain-production --service retain-production-api \
  --desired-count 4 --deployment-configuration "minimumHealthyPercent=100,maximumPercent=125"
```

### Pre-production checklist

- [ ] Staging smoke tests passed
- [ ] Database migration tested on staging snapshot
- [ ] PagerDuty on-call acknowledged
- [ ] Rollback image tags documented
- [ ] Shopify Partner Dashboard URLs unchanged (or updated in same deploy)

---

## Rollback Procedures

### ECS service rollback (fastest — ~5 min)

```bash
CLUSTER=retain-production
SERVICE=retain-production-api
PREVIOUS_TASK_DEF=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].deployments[?status==`PRIMARY`].taskDefinition' --output text)

# List recent task definition revisions
aws ecs list-task-definitions --family-prefix retain-production-api --sort DESC --max-items 5

# Roll back to previous revision
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition retain-production-api:PREVIOUS_REVISION
```

Repeat for `retain-production-ai` and `retain-production-webhook-worker`.

### Terraform rollback

```bash
cd infra/terraform
git checkout HEAD~1 -- environments/production/terraform.tfvars  # or pin previous image tags
terraform apply -var-file=environments/production/terraform.tfvars \
  -var="api_image=$REGISTRY/retain-api:PREVIOUS_TAG" ...
```

### Database rollback

- **Forward-only migrations preferred.** If migration is destructive, restore RDS from pre-deploy snapshot:
  ```bash
  aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier retain-production-restored \
    --db-snapshot-identifier pre-deploy-YYYYMMDD
  ```
- Update `DATABASE_URL` in Secrets Manager and restart ECS services.

### Static asset rollback

Re-sync previous build artifacts from CI artifact store or git tag, then invalidate CloudFront.

---

## Incident Response Checklist

### Severity classification

| Sev | Examples                              | Response time |
| --- | ------------------------------------- | ------------- |
| S1  | API down, billing failures, data loss | 15 min        |
| S2  | Webhook DLQ growing, AI degraded      | 30 min        |
| S3  | Elevated latency, single-store issue  | 2 hr          |

### Initial response (all severities)

1. **Acknowledge** PagerDuty alert; post in `#incidents` Slack channel.
2. **Assess impact:** Check Datadog dashboards and CloudWatch alarms.
3. **Identify blast radius:** All merchants vs single shop; API vs worker vs AI.
4. **Communicate:** Status update every 30 min for S1/S2.

### Diagnostic commands

```bash
# ECS service events
aws ecs describe-services --cluster retain-production \
  --services retain-production-api retain-production-webhook-worker

# Recent API logs
aws logs tail /retain/production --log-stream-name-prefix api --since 15m

# RDS status
aws rds describe-db-instances --db-instance-identifier retain-production

# Redis cluster
aws elasticache describe-replication-groups --replication-group-id retain-production

# ALB target health
TG_ARN=$(aws elbv2 describe-target-groups --names retain-production-api --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn "$TG_ARN"
```

### Playbooks by alert

| Alert                     | First actions                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| **API 5xx / no tasks**    | Check ECS events → recent deploy? Roll back task definition. Check RDS connectivity.         |
| **Webhook DLQ depth**     | Inspect DLQ jobs in Redis (`BullMQ`). Fix root cause, replay or discard poison messages.     |
| **Billing failures**      | Check Shopify billing API status, Retain billing worker logs, Stripe/SendGrid if applicable. |
| **RDS CPU / connections** | Identify slow queries in Performance Insights. Scale instance class if sustained.            |
| **Redis memory**          | Evict stale keys, increase node size, check queue backpressure.                              |
| **AI latency**            | Verify model artifacts in S3, check GPU/CPU saturation, scale AI tasks.                      |

### Post-incident

1. Write postmortem within 48 hours (timeline, root cause, action items).
2. Add regression test or alarm if gap identified.
3. Update this runbook with lessons learned.

---

## Local Docker Compose (development)

```bash
cp .env.development .env   # optional
docker compose -f docker-compose.yml -f docker-compose.apps.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.apps.yml --profile migrate run --rm migrate
```

---

## Kubernetes alternative

See [k8s/README.md](./k8s/README.md) for Helm-based deployments on EKS.

---

## Contacts

| Role                    | Escalation           |
| ----------------------- | -------------------- |
| On-call engineer        | PagerDuty primary    |
| Platform lead           | Secondary PagerDuty  |
| Shopify Partner support | partners.shopify.com |
