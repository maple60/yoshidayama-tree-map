args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) {
  stop(
    "Usage: Rscript scripts/verify_build.R VARIANT OUTPUT_DIR",
    call. = FALSE
  )
}

variant <- tolower(args[[1L]])
output_dir <- normalizePath(args[[2L]], mustWork = TRUE)
if (!variant %in% c("public", "cloudflare")) {
  stop("VARIANT must be 'public' or 'cloudflare'.", call. = FALSE)
}

index_file <- file.path(output_dir, "index.html")
if (!file.exists(index_file) || file.info(index_file)$size <= 0) {
  stop("Rendered index.html is missing or empty.", call. = FALSE)
}

html <- paste(readLines(index_file, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
open_tag <- '<script id="tree-map-data" type="application/json">'
start <- regexpr(open_tag, html, fixed = TRUE)[[1L]]
if (start < 1L) {
  stop("Embedded tree-map JSON was not found.", call. = FALSE)
}
json_start <- start + nchar(open_tag)
remainder <- substring(html, json_start)
json_end <- regexpr("</script>", remainder, fixed = TRUE)[[1L]]
if (json_end < 1L) {
  stop("Embedded tree-map JSON is not terminated.", call. = FALSE)
}
tree_json <- substring(remainder, 1L, json_end - 1L)
trees <- jsonlite::fromJSON(tree_json, simplifyDataFrame = TRUE)

public_columns <- c(
  "record_id", "species_ja", "species_scientific",
  "latitude", "longitude", "year", "note"
)
expected_columns <- public_columns
if (identical(variant, "cloudflare")) {
  expected_columns <- c(expected_columns, "planted_by")
}
if (!identical(names(trees), expected_columns)) {
  stop("Embedded JSON columns do not match the variant allowlist.", call. = FALSE)
}

variant_marker <- sprintf('data-site-variant="%s"', variant)
if (!grepl(variant_marker, html, fixed = TRUE)) {
  stop("Rendered page variant marker is missing.", call. = FALSE)
}

sri_hashes <- c(
  "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
  "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
)
if (!all(vapply(sri_hashes, grepl, logical(1L), x = html, fixed = TRUE))) {
  stop("Leaflet subresource integrity metadata is missing.", call. = FALSE)
}

headers_file <- file.path(output_dir, "_headers")
if (identical(variant, "cloudflare")) {
  if (!file.exists(headers_file)) {
    stop("Cloudflare security headers are missing.", call. = FALSE)
  }
  headers <- paste(readLines(headers_file, warn = FALSE), collapse = "\n")
  if (!grepl("X-Robots-Tag: noindex, nofollow", headers, fixed = TRUE)) {
    stop("Cloudflare X-Robots-Tag is missing.", call. = FALSE)
  }
} else if (file.exists(headers_file)) {
  stop("Cloudflare headers are present in the public artifact.", call. = FALSE)
}

if (identical(variant, "public")) {
  forbidden_extensions <- c("csv", "tsv", "xlsx", "rds", "qmd")
  artifact_files <- list.files(output_dir, recursive = TRUE, full.names = TRUE)
  artifact_extensions <- tolower(tools::file_ext(artifact_files))
  if (any(artifact_extensions %in% forbidden_extensions)) {
    stop("A source or data file is present in the public artifact.", call. = FALSE)
  }

  text_files <- artifact_files[
    artifact_extensions %in% c("html", "js", "css", "json", "xml", "txt")
  ]
  text_content <- vapply(
    text_files,
    function(path) paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n"),
    character(1L),
    USE.NAMES = FALSE
  )

  credential_patterns <- c(
    "BEGIN PRIVATE KEY",
    '"private_key":',
    '"client_email":',
    "gha-creds-"
  )
  if (any(vapply(
    credential_patterns,
    function(pattern) any(grepl(pattern, text_content, fixed = TRUE)),
    logical(1L)
  ))) {
    stop("Credential material is present in the public artifact.", call. = FALSE)
  }
}

message(sprintf("Verified %s build: %d public tree records.", variant, nrow(trees)))
