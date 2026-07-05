resource "aws_s3_bucket" "models" {
  bucket = "retain-${var.environment}-models-${var.account_id}"
  tags   = { Name = "retain-models" }
}

resource "aws_s3_bucket" "datalake" {
  bucket = "retain-${var.environment}-datalake-${var.account_id}"
  tags   = { Name = "retain-datalake" }
}

resource "aws_s3_bucket" "admin_static" {
  bucket = "retain-${var.environment}-admin-${var.account_id}"
  tags   = { Name = "retain-admin-static" }
}

resource "aws_s3_bucket" "portal_static" {
  bucket = "retain-${var.environment}-portal-${var.account_id}"
  tags   = { Name = "retain-portal-static" }
}

resource "aws_s3_bucket_versioning" "models" {
  bucket = aws_s3_bucket.models.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "models" {
  bucket = aws_s3_bucket.models.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = {
    models = aws_s3_bucket.models.id
    datalake = aws_s3_bucket.datalake.id
    admin = aws_s3_bucket.admin_static.id
    portal = aws_s3_bucket.portal_static.id
  }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
