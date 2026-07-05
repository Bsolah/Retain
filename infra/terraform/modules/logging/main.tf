resource "aws_cloudwatch_log_group" "this" {
  name              = "/retain/${var.environment}"
  retention_in_days = var.environment == "production" ? 90 : 30
}
