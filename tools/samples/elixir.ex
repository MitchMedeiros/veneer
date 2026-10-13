defmodule Demo.Shapes do
  @moduledoc """
  Shapes and their areas.
  """

  defstruct [:name, radius: 1.0]

  @type t :: %__MODULE__{name: String.t(), radius: float()}

  # circle area
  def area(%__MODULE__{radius: r}), do: :math.pi() * r * r

  def describe(shapes) when is_list(shapes) do
    shapes
    |> Enum.map(fn s -> "#{s.name}: #{area(s)}" end)
    |> Enum.join(", ")
  end

  defp helper(x) when x > 0, do: {:ok, x}
  defp helper(_), do: {:error, :negative}
end

case Demo.Shapes.describe([%Demo.Shapes{name: "c"}]) do
  "" -> IO.puts("empty")
  text -> IO.puts(text)
end
