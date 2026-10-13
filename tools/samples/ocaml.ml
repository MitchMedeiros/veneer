(* a small module *)
type shape =
  | Circle of float
  | Rect of float * float

let area = function
  | Circle r -> 3.14159 *. r *. r
  | Rect (w, h) -> w *. h

module Stack = struct
  type 'a t = 'a list
  let empty : 'a t = []
  let push x s = x :: s
end

let rec sum = function
  | [] -> 0
  | x :: rest -> x + sum rest

let () =
  let shapes = [ Circle 1.0; Rect (2.0, 3.5) ] in
  List.iter (fun s -> Printf.printf "%.2f\n" (area s)) shapes;
  print_endline (string_of_int (sum [ 1; 2; 3 ]))
