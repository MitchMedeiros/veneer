module demo;

import std.stdio;
import std.algorithm : map, sum;

/// A shape.
interface Shape {
    double area() const;
}

class Circle : Shape {
    private double r;
    this(double r) { this.r = r; }
    override double area() const { return 3.14159 * r * r; }
}

T twice(T)(T x) pure nothrow {
    return x * 2;
}

void main() {
    Shape[] shapes = [new Circle(1.0), new Circle(2.5)];
    auto total = shapes.map!(s => s.area()).sum();
    writefln("total: %.2f", total);
    /* block */
    foreach (i; 0 .. 3) {
        writeln(twice(i), "text", 'c', 0xFF);
    }
}
