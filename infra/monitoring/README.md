# Retain Monitoring

Observability stack for ECS (primary) and Kubernetes (alternative).

## Datadog (recommended)

1. Create a Datadog account and API key.
2. Store `DD_API_KEY` in AWS Secrets Manager (`retain/{env}/datadog`).
3. For ECS, add the Datadog agent sidecar to task definitions (see `datadog/values.yaml`).
4. Enable APM in each service:
   - **API / Worker:** `dd-trace` Node.js — set `DD_TRACE_ENABLED=true`, `DD_SERVICE=retain-api|retain-worker`
   - **AI:** `ddtrace` Python — set `DD_TRACE_ENABLED=true`, `DD_SERVICE=retain-ai`
5. Import dashboards from `datadog/dashboards/` via Datadog UI or API.

### Custom metrics (emit from application code)

| Metric                         | Namespace            | Description               |
| ------------------------------ | -------------------- | ------------------------- |
| `retain.webhooks.queue.depth`  | Retain/Webhooks      | BullMQ waiting count      |
| `retain.webhooks.dlq.depth`    | Retain/Webhooks      | Dead-letter queue depth   |
| `retain.billing.failure.count` | Retain/Billing       | Failed billing attempts   |
| `retain.ai.predictions`        | Retain/AI            | Inference count           |
| `retain.subscriptions.active`  | Retain/Subscriptions | Active subscription gauge |

CloudWatch alarms in Terraform forward critical signals to PagerDuty via SNS.

## Grafana Cloud (alternative)

1. Install Grafana Alloy or Grafana Agent on ECS/EKS.
2. Configure OTLP export: `OTEL_EXPORTER_OTLP_ENDPOINT` + auth header.
3. Create dashboards mirroring Datadog JSON queries in PromQL/LogQL.

## Alerting — PagerDuty

| Alert                   | Source                 | Severity |
| ----------------------- | ---------------------- | -------- |
| API p95 latency > 2s    | CloudWatch ALB         | High     |
| API 5xx spike           | CloudWatch ALB         | Critical |
| Webhook DLQ depth > 0   | CloudWatch custom      | Critical |
| Billing failures > 5/5m | CloudWatch custom      | Critical |
| RDS CPU > 80%           | CloudWatch RDS         | High     |
| RDS no connections      | CloudWatch RDS         | Critical |
| Redis memory > 80%      | CloudWatch ElastiCache | High     |
| ECS API tasks < 1       | CloudWatch ECS         | Critical |

Wire PagerDuty Events API v2 URL in `terraform.tfvars` → `pagerduty_endpoint`.

## APM trace propagation

Ensure `traceparent` / Datadog headers propagate:

- API → AI (`AI_SERVICE_URL` calls)
- Worker → API / AI
- Ingress → API (ALB or NGINX)

Set `DD_TRACE_SAMPLE_RATE=1.0` in staging, `0.2` in production.
