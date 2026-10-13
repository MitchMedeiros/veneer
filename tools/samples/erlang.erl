-module(demo).
-export([area/1, sum/1, start/0]).

%% shapes
-record(rect, {w = 0, h = 0}).

area({circle, R}) -> math:pi() * R * R;
area(#rect{w = W, h = H}) -> W * H.

sum([]) -> 0;
sum([H | T]) -> H + sum(T).

start() ->
    Shapes = [{circle, 1.0}, #rect{w = 2, h = 3}],
    Total = lists:sum([area(S) || S <- Shapes]),
    io:format("total: ~p~n", [Total]),
    Pid = spawn(fun() -> receive stop -> ok end end),
    Pid ! stop,
    case Total > 5 of
        true -> big;
        false -> small
    end.
