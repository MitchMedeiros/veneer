{-# LANGUAGE ScopedTypeVariables #-}
module Main where

import qualified Data.Map as Map
import Data.List (sortBy)

-- | A shape.
data Shape = Circle Double | Rect Double Double
  deriving (Show, Eq)

class HasArea a where
  area :: a -> Double

instance HasArea Shape where
  area (Circle r) = pi * r * r
  area (Rect w h) = w * h

{- block
   comment -}
total :: [Shape] -> Double
total = sum . map area

main :: IO ()
main = do
  let shapes = [Circle 1.0, Rect 2 3.5]
      m = Map.fromList (zip [1 :: Int ..] shapes)
  putStrLn $ "total: " ++ show (total shapes)
  mapM_ print (Map.toList m)
