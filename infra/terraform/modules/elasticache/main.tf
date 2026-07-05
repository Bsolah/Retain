resource "aws_security_group" "redis" {
  name        = "retain-${var.environment}-redis"
  description = "Redis access from ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "retain-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "retain-${var.environment}"
  description              = "Retain Redis cluster mode"
  engine                   = "redis"
  engine_version           = "7.1"
  node_type                = var.node_type
  num_node_groups          = var.num_node_groups
  replicas_per_node_group  = 1
  automatic_failover_enabled = true
  multi_az_enabled         = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name        = aws_elasticache_subnet_group.this.name
  security_group_ids       = [aws_security_group.redis.id]
  port                     = 6379
  snapshot_retention_limit = 7
  tags = { Name = "retain-${var.environment}-redis" }
}
