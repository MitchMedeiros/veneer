#lang racket

;; shapes
(struct circle (r))
(struct rect (w h))

(define (area s)
  (cond
    [(circle? s) (* pi (circle-r s) (circle-r s))]
    [(rect? s) (* (rect-w s) (rect-h s))]
    [else 0]))

#| block
   comment |#
(define shapes (list (circle 1.0) (rect 2 3.5)))
(for ([s (in-list shapes)])
  (printf "area: ~a\n" (area s)))
(define greeting "Hello, \"world\"")
(let loop ([i 0])
  (when (< i 3)
    (displayln #\a)
    (loop (add1 i))))
