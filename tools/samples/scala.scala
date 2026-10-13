package demo

import scala.collection.mutable

/** A shape. */
sealed trait Shape
case class Circle(r: Double) extends Shape
case class Rect(w: Double, h: Double) extends Shape

object Main extends App {
  def area(s: Shape): Double = s match {
    case Circle(r)  => math.Pi * r * r
    case Rect(w, h) => w * h
  }

  val shapes = List(Circle(1.0), Rect(2, 3.5))
  val total = shapes.map(area).sum
  println(s"total area: $total")
  implicit val ord: Ordering[Int] = Ordering.Int
  for (i <- 1 to 3 if i % 2 == 1) yield i * 2
}
