variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) }
variable "instance_class" { type = string }
variable "multi_az" { type = bool }
variable "db_name" { type = string }
variable "db_username" { type = string }
