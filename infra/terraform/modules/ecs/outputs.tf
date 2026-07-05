output "cluster_name" { value = aws_ecs_cluster.this.name }
output "api_service_name" { value = aws_ecs_service.api.name }
output "ai_service_name" { value = aws_ecs_service.ai.name }
output "worker_service_name" { value = aws_ecs_service.worker.name }
