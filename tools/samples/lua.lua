-- line comment
--[[ block
comment ]]
local M = {}
local name <const> = "world"
local long = [==[
long string ]] still
]==]

function M.greet(who, ...)
  local s = ("Hello %s\n"):format(who or name)
  for i = 1, 10, 2 do
    if i % 3 == 0 and not (i > 5) then goto continue end
    print(i, #s, 0xFF, 3.5e2)
    ::continue::
  end
  return s .. "!"
end

local t = { a = 1, ["b"] = { 2, 3 }, [1] = function(x) return x end }
for k, v in pairs(t) do print(k, v) end
while false do break end
repeat local x = 1 until x == 1
return M
