# summarise a data frame
library(dplyr)

summarise_scores <- function(df, threshold = 50L) {
  df %>%
    filter(score > threshold) %>%
    group_by(group) %>%
    summarise(mean = mean(score), n = n())
}

df <- data.frame(
  group = c("a", "b", "a"),
  score = c(10.5, 72, 88),
  stringsAsFactors = FALSE
)

if (nrow(df) > 0 && !is.null(df$score)) {
  result <- summarise_scores(df)
  print(paste("rows:", nrow(result)))
} else {
  stop("empty")
}
x <- c(1, 2, NA, 4)
mean(x, na.rm = TRUE)
