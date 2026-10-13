$ ls -la /tmp | head -3
total 8
drwxrwxrwt  4 root  wheel  128 Jan  1 00:00 .
$ echo "hello $USER" > out.txt
$ for f in *.txt; do wc -l "$f"; done
      1 out.txt
# whoami
root
