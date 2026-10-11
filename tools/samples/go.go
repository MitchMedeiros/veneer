// Package main is a sample.
package main

import (
	"fmt"
	str "strings"
)

type Shape interface {
	Area() float64
}

type Rect struct {
	W, H float64 `json:"w"`
}

const (
	A = iota
	B
	Max = 1 << 10
)

/* block comment */
func (r *Rect) Area() float64 { return r.W * r.H }

func Map[T, U any](xs []T, f func(T) U) []U {
	out := make([]U, 0, len(xs))
	for _, x := range xs {
		out = append(out, f(x))
	}
	return out
}

func main() {
	raw := `raw
string`
	s := "esc\t\"q\" %d"
	r := 'x'
	ch := make(chan int, 3)
	go func() { ch <- 0x1F + 07 + 1_000 }()
	select {
	case v := <-ch:
		fmt.Println(v, s, r, raw, str.ToUpper("a"), 3.14e2, 2i)
	default:
	}
	var m map[string][]int = nil
	defer fmt.Println(m == nil)
}
