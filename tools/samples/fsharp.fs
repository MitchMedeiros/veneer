module Demo

open System

// a record and a union
type Person = { Name: string; Age: int }

type Shape =
    | Circle of radius: float
    | Rect of width: float * height: float

let area shape =
    match shape with
    | Circle r -> Math.PI * r * r
    | Rect (w, h) -> w * h

let people = [ { Name = "Ann"; Age = 30 }; { Name = "Bob"; Age = 25 } ]

let names =
    people
    |> List.filter (fun p -> p.Age > 26)
    |> List.map (fun p -> p.Name)

(* block comment *)
printfn "%A %d" names (List.length people)
