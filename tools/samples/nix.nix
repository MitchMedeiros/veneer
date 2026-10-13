# a small flake-like expression
{ pkgs ? import <nixpkgs> {}, lib, ... }:

let
  name = "demo";
  version = "1.0.${toString 2}";
  deps = with pkgs; [ git curl ];
in
pkgs.stdenv.mkDerivation rec {
  pname = name;
  inherit version;
  src = ./.;
  buildInputs = deps;

  /* multi
     line */
  installPhase = ''
    mkdir -p $out/bin
    echo "built ${pname}" > $out/log
  '';

  meta = {
    description = "A demo";
    license = lib.licenses.mit;
    enable = if version != null then true else false;
  };
}
