require "json"

# A shape.
abstract class Shape
  abstract def area : Float64
end

class Circle < Shape
  def initialize(@r : Float64)
  end

  def area : Float64
    Math::PI * @r * @r
  end
end

module Util
  def self.total(shapes : Array(Shape)) : Float64
    shapes.sum(&.area)
  end
end

shapes = [Circle.new(1.0), Circle.new(2.5)] of Shape
puts "total: #{Util.total(shapes)}"
x = 10_000
case x
when .> 5 then puts "big"
else puts "small"
end
pp :symbol, %w(a b c), /re+gex/i
