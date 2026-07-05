output "configuration_endpoint" { value = aws_elasticache_replication_group.this.configuration_endpoint_address }
output "connection_string" {
  value     = "rediss://${aws_elasticache_replication_group.this.configuration_endpoint_address}:6379"
  sensitive = true
}
output "replication_group_id" { value = aws_elasticache_replication_group.this.id }
