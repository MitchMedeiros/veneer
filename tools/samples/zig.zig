const std = @import("std");

/// A point.
const Point = struct {
    x: f32,
    y: f32,

    pub fn dist(self: Point) f32 {
        return @sqrt(self.x * self.x + self.y * self.y);
    }
};

const Error = error{ OutOfRange, Empty };

fn check(n: i32) Error!i32 {
    if (n < 0) return error.OutOfRange;
    return n * 2;
}

pub fn main() !void {
    const p = Point{ .x = 3, .y = 4 };
    std.debug.print("dist = {d:.2}\n", .{p.dist()});
    var i: usize = 0;
    while (i < 3) : (i += 1) {
        const v = check(@intCast(i)) catch 0;
        _ = v;
    }
}
