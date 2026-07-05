output "endpoint" { value = aws_db_instance.this.address }
output "instance_id" { value = aws_db_instance.this.id }
output "connection_string" {
  value     = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.this.address}:5432/${var.db_name}"
  sensitive = true
}
