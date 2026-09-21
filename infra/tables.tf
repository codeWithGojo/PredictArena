locals {
  tables = {
    users = { ttl = false, indexes = {
      expiry-index = { pk = "expiryDay", sk = "expirySort" }
    } }
    fixtures = { ttl = false, indexes = {
      sport-day-index       = { pk = "sportDay", sk = "timeKey" }
      competition-day-index = { pk = "competitionDay", sk = "timeKey" }
    } }
    predictions = { ttl = false, indexes = {} }
    catalog     = { ttl = false, indexes = {} }
    standings   = { ttl = true, indexes = {} }
  }
}
resource "aws_dynamodb_table" "this" {
  for_each                    = local.tables
  name                        = "${local.prefix}-${each.key}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  range_key                   = "sk"
  deletion_protection_enabled = var.stage == "prod"
  stream_enabled              = false
  dynamic "attribute" {
    for_each = toset(concat(["pk", "sk"], flatten([for i in values(each.value.indexes) : [i.pk, i.sk]])))
    content {
      name = attribute.value
      type = "S"
    }
  }
  dynamic "global_secondary_index" {
    for_each = each.value.indexes
    content {
      name            = global_secondary_index.key
      hash_key        = global_secondary_index.value.pk
      range_key       = global_secondary_index.value.sk
      projection_type = "ALL"
    }
  }
  dynamic "ttl" {
    for_each = each.value.ttl ? [1] : []
    content {
      enabled        = true
      attribute_name = "expiresAt"
    }
  }
  server_side_encryption { enabled = true }
  point_in_time_recovery { enabled = true }
}
