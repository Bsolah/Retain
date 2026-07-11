# Retain Infrastructure

Production-ready infrastructure as code for the Retain monorepo.

## Components

| Path                         | Description                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------ |
| [terraform/](./terraform/)   | AWS ECS Fargate, ALB, CloudFront, RDS, ElastiCache, S3, VPC                    |
| [k8s/](./k8s/)               | Kubernetes alternative — Helm charts, HPA, PDB, network policies, cert-manager |
| [monitoring/](./monitoring/) | Datadog/Grafana dashboards, APM, alerting                                      |
| [docker/](./docker/)         | Migration helper Dockerfile                                                    |
| [railway/](./railway/)       | Railway multi-service deploy guide + per-app `railway.toml` paths              |
| [RUNBOOK.md](./RUNBOOK.md)   | Staging/production deploy, rollback, incident response                         |

## Docker images

Build from repository root:

```bash
docker build -f apps/api/Dockerfile .
docker build -f apps/ai/Dockerfile .
docker build -f apps/webhook-worker/Dockerfile .
docker build -f apps/admin/Dockerfile .
docker build -f apps/portal/Dockerfile .
```

Local full stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.apps.yml up -d --build
```

Environment files: `.env.development` (local), `.env.staging`, `.env.production`.

## Quick links

- **Deploy:** [RUNBOOK.md](./RUNBOOK.md)
- **Terraform:** [terraform/README.md](./terraform/README.md)
- **Kubernetes:** [k8s/README.md](./k8s/README.md)
- **Monitoring:** [monitoring/README.md](./monitoring/README.md)
