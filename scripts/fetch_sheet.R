args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) {
  stop("Usage: Rscript scripts/fetch_sheet.R OUTPUT_CSV", call. = FALSE)
}

output_dir <- normalizePath(dirname(args[[1L]]), mustWork = TRUE)
output_file <- file.path(output_dir, basename(args[[1L]]))
sheet_id <- trimws(Sys.getenv("TREE_SHEET_ID", unset = ""))
access_token <- trimws(Sys.getenv("GOOGLE_ACCESS_TOKEN", unset = ""))
sheet_range <- trimws(Sys.getenv("TREE_SHEET_RANGE", unset = ""))

if (!nzchar(sheet_id)) {
  stop("TREE_SHEET_ID is required.", call. = FALSE)
}
if (!nzchar(access_token)) {
  stop("GOOGLE_ACCESS_TOKEN is required.", call. = FALSE)
}

api_get <- function(url) {
  response_file <- tempfile(fileext = ".json")
  on.exit(unlink(response_file), add = TRUE)

  status <- utils::download.file(
    url,
    response_file,
    quiet = TRUE,
    mode = "wb",
    method = "libcurl",
    headers = c(Authorization = paste("Bearer", access_token))
  )
  if (!identical(status, 0L)) {
    stop("Google Sheets API request failed.", call. = FALSE)
  }

  jsonlite::fromJSON(response_file, simplifyVector = FALSE)
}

spreadsheet_url <- sprintf(
  paste0(
    "https://sheets.googleapis.com/v4/spreadsheets/%s",
    "?includeGridData=false&fields=sheets.properties(title,index)"
  ),
  utils::URLencode(sheet_id, reserved = TRUE)
)

if (!nzchar(sheet_range)) {
  metadata <- api_get(spreadsheet_url)
  if (is.null(metadata$sheets) || !length(metadata$sheets)) {
    stop("The spreadsheet has no sheets.", call. = FALSE)
  }

  sheet_indexes <- vapply(
    metadata$sheets,
    function(sheet) as.integer(sheet$properties$index),
    integer(1L)
  )
  first_sheet <- metadata$sheets[[which.min(sheet_indexes)]]
  sheet_title <- first_sheet$properties$title
  escaped_title <- gsub("'", "''", sheet_title, fixed = TRUE)
  sheet_range <- sprintf("'%s'!A:ZZ", escaped_title)
}

values_url <- sprintf(
  paste0(
    "https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s",
    "?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE"
  ),
  utils::URLencode(sheet_id, reserved = TRUE),
  utils::URLencode(sheet_range, reserved = TRUE)
)
response <- api_get(values_url)
rows <- response$values

if (is.null(rows) || length(rows) < 2L) {
  stop("The selected sheet range has no data rows.", call. = FALSE)
}

headers <- trimws(as.character(unlist(rows[[1L]], use.names = FALSE)))
if (!length(headers) || any(!nzchar(headers)) || anyDuplicated(headers)) {
  stop("The header row must contain unique, non-empty column names.", call. = FALSE)
}

data_rows <- rows[-1L]
matrix_data <- matrix(NA_character_, nrow = length(data_rows), ncol = length(headers))
for (row_index in seq_along(data_rows)) {
  row_values <- as.character(unlist(data_rows[[row_index]], use.names = FALSE))
  if (length(row_values) > length(headers)) {
    stop("A data row has more values than the header row.", call. = FALSE)
  }
  if (length(row_values)) {
    matrix_data[row_index, seq_along(row_values)] <- row_values
  }
}

trees <- as.data.frame(matrix_data, stringsAsFactors = FALSE, check.names = FALSE)
names(trees) <- headers
utils::write.csv(trees, output_file, row.names = FALSE, na = "", fileEncoding = "UTF-8")
