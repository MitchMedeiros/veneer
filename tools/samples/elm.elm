module Main exposing (main)

import Browser
import Html exposing (Html, button, div, text)
import Html.Events exposing (onClick)


-- MODEL


type alias Model =
    { count : Int }


type Msg
    = Increment
    | Decrement


{-| Start at zero. -}
init : Model
init =
    { count = 0 }


update : Msg -> Model -> Model
update msg model =
    case msg of
        Increment ->
            { model | count = model.count + 1 }

        Decrement ->
            { model | count = model.count - 1 }


view : Model -> Html Msg
view model =
    div []
        [ button [ onClick Decrement ] [ text "-" ]
        , text (String.fromInt model.count)
        ]


main =
    Browser.sandbox { init = init, update = update, view = view }
