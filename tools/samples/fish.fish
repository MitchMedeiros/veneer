# greet someone
function greet --description 'Say hello'
    set -l name $argv[1]
    if test -z "$name"
        echo "usage: greet NAME" >&2
        return 1
    end
    for i in (seq 1 3)
        printf "Hello, %s (%d)\n" $name $i
    end
end

set -gx PATH $HOME/bin $PATH
switch (uname)
    case Darwin
        echo mac
    case '*'
        echo other
end
