locals {
  api_service_name    = "retain-${var.environment}-api"
  ai_service_name     = "retain-${var.environment}-ai"
  worker_service_name = "retain-${var.environment}-webhook-worker"
}

resource "aws_ecs_cluster" "this" {
  name = "retain-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_security_group_rule" "api_from_alb" {
  type                     = "ingress"
  from_port                = 3001
  to_port                  = 3001
  protocol                 = "tcp"
  security_group_id        = var.app_security_group_id
  source_security_group_id = var.alb_security_group_id
}

resource "aws_security_group_rule" "ai_from_alb" {
  type                     = "ingress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  security_group_id        = var.app_security_group_id
  source_security_group_id = var.alb_security_group_id
}

resource "aws_security_group_rule" "worker_from_alb" {
  type                     = "ingress"
  from_port                = 3002
  to_port                  = 3002
  protocol                 = "tcp"
  security_group_id        = var.app_security_group_id
  source_security_group_id = var.alb_security_group_id
}

locals {
  common_env = {
    NODE_ENV     = "production"
    DATABASE_URL = var.database_url
    REDIS_URL    = var.redis_url
  }

  api_container = {
    name  = "api"
    image = var.api_image
    port  = 3001
    environment = merge(local.common_env, var.api_env, {
      PORT              = "3001"
      HOST              = "0.0.0.0"
      AI_SERVICE_URL    = var.ai_internal_url
      SKIP_BACKGROUND_WORKERS = "false"
      PROCESS_WEBHOOKS_IN_API = "false"
    })
  }

  ai_container = {
    name  = "ai"
    image = var.ai_image
    port  = 8000
    environment = merge(var.ai_env, {
      ENVIRONMENT       = var.environment
      DATABASE_URL      = var.database_url
      REDIS_URL         = var.redis_url
      MODELS_URI_PREFIX = "s3://${var.models_bucket}/churn"
      AWS_REGION        = var.aws_region
    })
  }

  worker_container = {
    name  = "webhook-worker"
    image = var.webhook_worker_image
    port  = 3002
    environment = merge(local.common_env, var.worker_env, {
      PORT           = "3002"
      HOST           = "0.0.0.0"
      AI_SERVICE_URL = var.ai_internal_url
    })
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = local.api_service_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name      = local.api_container.name
    image     = local.api_container.image
    essential = true
    portMappings = [{ containerPort = local.api_container.port, protocol = "tcp" }]
    environment = [for k, v in local.api_container.environment : { name = k, value = tostring(v) }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "api"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3001/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

resource "aws_ecs_task_definition" "ai" {
  family                   = local.ai_service_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name      = local.ai_container.name
    image     = local.ai_container.image
    essential = true
    portMappings = [{ containerPort = local.ai_container.port, protocol = "tcp" }]
    environment = [for k, v in local.ai_container.environment : { name = k, value = tostring(v) }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ai"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = local.worker_service_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name      = local.worker_container.name
    image     = local.worker_container.image
    essential = true
    portMappings = [{ containerPort = local.worker_container.port, protocol = "tcp" }]
    environment = [for k, v in local.worker_container.environment : { name = k, value = tostring(v) }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = local.api_service_name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = 3001
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = true
}

resource "aws_ecs_service" "ai" {
  name            = local.ai_service_name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.ai.arn
  desired_count   = var.ai_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.ai_target_group_arn
    container_name   = "ai"
    container_port   = 8000
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = true
}

resource "aws_ecs_service" "worker" {
  name            = local.worker_service_name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.webhook_worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.webhook_worker_target_group_arn
    container_name   = "webhook-worker"
    container_port   = 3002
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = true
}
