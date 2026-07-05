output "models_bucket_name" { value = aws_s3_bucket.models.bucket }
output "models_bucket_arn" { value = aws_s3_bucket.models.arn }
output "datalake_bucket_name" { value = aws_s3_bucket.datalake.bucket }
output "datalake_bucket_arn" { value = aws_s3_bucket.datalake.arn }
output "admin_static_bucket_name" { value = aws_s3_bucket.admin_static.bucket }
output "portal_static_bucket_name" { value = aws_s3_bucket.portal_static.bucket }
