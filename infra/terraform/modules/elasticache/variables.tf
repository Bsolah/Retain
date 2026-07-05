variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) }
variable "node_type" { type = string }
variable "num_node_groups" { type = number }
