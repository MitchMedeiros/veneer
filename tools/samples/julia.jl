# a small module
module Demo

using LinearAlgebra

abstract type Shape end

struct Circle <: Shape
    r::Float64
end

"""
    area(s)

Area of a shape.
"""
area(c::Circle) = pi * c.r^2

function total(shapes::Vector{<:Shape})::Float64
    s = 0.0
    for sh in shapes
        s += area(sh)
    end
    return s
end

macro twice(ex)
    :($ex; $ex)
end

xs = [Circle(1.0), Circle(2.5)]
println("total = $(total(xs))")
@show xs[1].r
end
