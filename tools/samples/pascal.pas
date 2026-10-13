program Demo;

{$mode objfpc}

uses SysUtils;

type
  TPerson = class
  private
    FName: string;
  public
    constructor Create(const AName: string);
    function Greet: string;
  end;

constructor TPerson.Create(const AName: string);
begin
  FName := AName;
end;

function TPerson.Greet: string;
begin
  Result := 'Hello, ' + FName;
end;

var
  p: TPerson;
  i: Integer;
begin
  (* block comment *)
  p := TPerson.Create('Ann');
  for i := 1 to 3 do
    WriteLn(p.Greet, ' ', i * 2.5);
  // line comment
  p.Free;
end.
