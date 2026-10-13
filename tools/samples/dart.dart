import 'dart:async';

/// A counter.
abstract class Shape {
  double area();
}

class Circle extends Shape {
  final double r;
  Circle(this.r);

  @override
  double area() => 3.14159 * r * r;
}

Future<int> fetch(String url, {int retries = 3}) async {
  var attempt = 0;
  while (attempt < retries) {
    try {
      await Future.delayed(const Duration(milliseconds: 10));
      return url.length;
    } catch (e) {
      attempt++;
    }
  }
  return -1;
}

void main() {
  final shapes = <Shape>[Circle(1), Circle(2.5)];
  print('total: ${shapes.map((s) => s.area()).reduce((a, b) => a + b)}');
}
