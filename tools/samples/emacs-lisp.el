;;; demo.el --- a small package  -*- lexical-binding: t; -*-

(require 'cl-lib)

(defgroup demo nil
  "Demo options."
  :group 'tools)

(defcustom demo-name "world"
  "Who to greet."
  :type 'string)

(defun demo-greet (&optional name)
  "Greet NAME."
  (interactive "sName: ")
  (let ((who (or name demo-name)))
    (message "Hello, %s! %d" who (+ 1 2))))

(defmacro demo-twice (&rest body)
  `(progn ,@body ,@body))

(add-hook 'after-init-hook #'demo-greet)
(setq demo-list '(1 2 3) demo-char ?a)
(provide 'demo)
