output "security_group_id" { value = aws_security_group.alb.id }
output "alb_arn_suffix" { value = aws_lb.this.arn_suffix }
output "api_target_group_arn" { value = aws_lb_target_group.api.arn }
output "ai_target_group_arn" { value = aws_lb_target_group.ai.arn }
output "worker_target_group_arn" { value = aws_lb_target_group.worker.arn }
output "api_target_group_arn_suffix" { value = aws_lb_target_group.api.arn_suffix }
