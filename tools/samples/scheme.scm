;; factorial and friends
(define (fact n)
  (if (<= n 1)
      1
      (* n (fact (- n 1)))))

#| block comment |#
(define-syntax swap!
  (syntax-rules ()
    ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp)))))

(let loop ((i 0) (acc '()))
  (if (< i 5)
      (loop (+ i 1) (cons (fact i) acc))
      (display (reverse acc))))
(display "done\n")
(define v #(1 2 3.5))
(newline)
