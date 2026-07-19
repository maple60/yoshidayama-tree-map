args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) {
  stop("Usage: Rscript scripts/fetch_sheet.R OUTPUT_CSV", call. = FALSE)
}

output_dir <- normalizePath(dirname(args[[1L]]), mustWork = TRUE)
output_file <- file.path(output_dir, basename(args[[1L]]))
sheet_id <- trimws(Sys.getenv("TREE_SHEET_ID", unset = ""))
access_token <- trimws(Sys.getenv("GOOGLE_ACCESS_TOKEN", unset = ""))
sheet_range <- trimws(Sys.getenv("TREE_SHEET_RANGE", unset = ""))
sheet_gid <- trimws(Sys.getenv("TREE_SHEET_GID", unset = "0"))
access_mode <- tolower(trimws(Sys.getenv(
  "TREE_SHEET_ACCESS_MODE",
  unset = "private"
)))
if (!nzchar(access_mode)) {
  access_mode <- "private"
}
if (!nzchar(sheet_gid)) {
  sheet_gid <- "0"
}

if (!nzchar(sheet_id)) {
  stop("TREE_SHEET_ID is required.", call. = FALSE)
}
if (!access_mode %in% c("private", "public-link")) {
  stop(
    "TREE_SHEET_ACCESS_MODE must be 'private' or 'public-link'.",
    call. = FALSE
  )
}

if (identical(access_mode, "public-link")) {
  if (nzchar(sheet_range)) {
    stop(
      "TREE_SHEET_RANGE is not supported in public-link mode; use TREE_SHEET_GID.",
      call. = FALSE
    )
  }
  if (!grepl("^[0-9]+$", sheet_gid)) {
    stop("TREE_SHEET_GID must contain digits only.", call. = FALSE)
  }

  csv_url <- sprintf(
    paste0(
      "https://docs.google.com/spreadsheets/d/%s/",
      "gviz/tq?tqx=out:csv&gid=%s"
    ),
    utils::URLencode(sheet_id, reserved = TRUE),
    utils::URLencode(sheet_gid, reserved = TRUE)
  )
  trees <- tryCatch(
    suppressWarnings(utils::read.csv(
      csv_url,
      fileEncoding = "UTF-8",
      check.names = FALSE,
      colClasses = "character",
      na.strings = c("", "NA")
    )),
    error = function(error) {
      stop(
        "The link-shared Google Sheet could not be downloaded: ",
        conditionMessage(error),
        call. = FALSE
      )
    }
  )

  headers <- trimws(names(trees))
  if (!length(headers) || any(!nzchar(headers)) || anyDuplicated(headers)) {
    stop("The header row must contain unique, non-empty column names.", call. = FALSE)
  }
  if (!nrow(trees)) {
    stop("The link-shared Google Sheet has no data rows.", call. = FALSE)
  }

  required_source_columns <- c(
    "record_id", "species_ja", "species_scientific",
    "latitude", "longitude", "publish", "year", "planted_by", "note"
  )
  missing_columns <- setdiff(required_source_columns, headers)
  if (length(missing_columns)) {
    stop(
      "The link-shared response is missing required columns: ",
      paste(missing_columns, collapse = ", "),
      call. = FALSE
    )
  }

  names(trees) <- headers
  utils::write.csv(
    trees,
    output_file,
    row.names = FALSE,
    na = "",
    fileEncoding = "UTF-8"
  )
  quit(save = "no", status = 0L)
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
