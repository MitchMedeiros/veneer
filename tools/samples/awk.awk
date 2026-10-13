# sum the second column
BEGIN { FS = ","; total = 0 }
/^#/ { next }
$2 ~ /^[0-9]+(\.[0-9]+)?$/ {
    total += $2
    count++
    names[$1] = $2
}
function avg(sum, n) {
    return n > 0 ? sum / n : 0
}
END {
    printf "total=%d avg=%.2f\n", total, avg(total, count)
    for (k in names) print k, names[k]
}
