(ns demo.core
  (:require [clojure.string :as str]))

;; a small example
(defn area
  "Area of a shape."
  [{:keys [type r w h]}]
  (case type
    :circle (* Math/PI r r)
    :rect   (* w h)
    0))

(def shapes [{:type :circle :r 1.0} {:type :rect :w 2 :h 3.5}])

(defmacro twice [x] `(do ~x ~x))

(defn -main [& args]
  (let [total (reduce + (map area shapes))]
    (println (str "total: " total))
    (when (> total 5)
      (println #"regex" \a "string with \"escape\""))))
