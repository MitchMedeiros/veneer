module Main where

import Prelude

import Data.Array (filter, length)
import Effect (Effect)
import Effect.Console (log)

-- | A shape.
data Shape = Circle Number | Rect Number Number

derive instance eqShape :: Eq Shape

area :: Shape -> Number
area (Circle r) = 3.14159 * r * r
area (Rect w h) = w * h

class Describe a where
  describe :: a -> String

instance describeShape :: Describe Shape where
  describe (Circle _) = "circle"
  describe _ = "rect"

main :: Effect Unit
main = do
  let shapes = [ Circle 1.0, Rect 2.0 3.5 ]
  log $ "count: " <> show (length shapes)
  log (describe (Circle 2.0))
