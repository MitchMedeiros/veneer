;;; shapes
(defpackage :demo
  (:use :cl))
(in-package :demo)

(defstruct circle (r 1.0))

(defgeneric area (shape)
  (:documentation "Area of a shape."))

(defmethod area ((c circle))
  (* pi (circle-r c) (circle-r c)))

#| block
   comment |#
(defun total (shapes)
  (loop for s in shapes
        sum (area s)))

(defmacro twice (x) `(progn ,x ,x))

(format t "total: ~a~%" (total (list (make-circle :r 2.5))))
(let ((x 10) (name "text"))
  (when (and (> x 5) (stringp name))
    (print #\a)))
