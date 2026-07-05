# Retain Kubernetes deployment (Helm alternative to ECS)

Deploy Retain on EKS or any Kubernetes cluster using individual Helm charts per service.

## Prerequisites

- Kubernetes 1.28+
- Helm 3.14+
- cert-manager (for TLS)
- NGINX Ingress Controller
- External Secrets Operator (recommended for DATABASE_URL, JWT_SECRET, etc.)

## Quick start

```bash
# Create namespace
kubectl create namespace retain

# Install cert-manager ClusterIssuer
kubectl apply -f cert-manager/cluster-issuer.yaml

# Default-deny network policies (apply after charts)
kubectl apply -f network-policies/default-deny.yaml

# Deploy services (set image tags and secrets in values)
helm upgrade --install retain-api charts/api -n retain \
  -f charts/api/values.yaml \
  --set image.tag=staging

helm upgrade --install retain-ai charts/ai -n retain \
  -f charts/ai/values.yaml

helm upgrade --install retain-webhook-worker charts/webhook-worker -n retain \
  -f charts/webhook-worker/values.yaml

helm upgrade --install retain-admin charts/admin -n retain \
  -f charts/admin/values.yaml

helm upgrade --install retain-portal charts/portal -n retain \
  -f charts/portal/values.yaml

# Apply cross-service network policies
kubectl apply -f network-policies/retain-services.yaml
```

## Autoscaling

Each backend chart includes HPA targeting:

- CPU utilization > 70%
- Memory utilization > 80%

## Pod Disruption Budgets

PDBs ensure at least one pod remains available during node drains and cluster upgrades.

## TLS

Ingress resources reference cert-manager `ClusterIssuer` `letsencrypt-prod` for automatic certificate provisioning.

## Monitoring

Install the Datadog agent from `../monitoring/datadog/values.yaml` or Grafana Alloy from `../monitoring/grafana/`.
