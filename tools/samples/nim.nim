import strutils, sequtils

# a small program
type
  Shape = ref object of RootObj
    name: string
  Circle = ref object of Shape
    r: float

proc area(c: Circle): float =
  ## Area of a circle.
  result = 3.14159 * c.r * c.r

proc total(xs: seq[Circle]): float =
  for x in xs:
    result += area(x)

when isMainModule:
  let shapes = @[Circle(name: "a", r: 1.0), Circle(name: "b", r: 2.5)]
  echo "total: ", total(shapes)
  var i = 0
  while i < 3:
    inc i
  let words = "a b c".split(' ').mapIt(it.toUpperAscii())
  echo words, 0xFF, 'c'
