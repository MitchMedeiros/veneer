#!/usr/bin/env tclsh
# a small script
proc greet {name {times 1}} {
    for {set i 0} {$i < $times} {incr i} {
        puts "Hello, $name #$i"
    }
}

set items [list a b c]
foreach item $items {
    if {$item eq "b"} {
        continue
    }
    greet $item 2
}

array set colors {red 1 green 2}
switch -exact -- $items {
    default { puts "done [llength $items]" }
}
