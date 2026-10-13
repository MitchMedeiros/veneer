#!/usr/bin/perl
use strict;
use warnings;

# count words
my %count;
my $file = shift @ARGV // 'input.txt';
open(my $fh, '<', $file) or die "Cannot open $file: $!";
while (my $line = <$fh>) {
    chomp $line;
    next if $line =~ /^\s*#/;
    $count{lc $_}++ for split /\W+/, $line;
}
close $fh;

sub top {
    my ($n, %h) = @_;
    return (sort { $h{$b} <=> $h{$a} } keys %h)[0 .. $n - 1];
}

printf "%-10s %d\n", $_, $count{$_} for top(3, %count);
my @list = qw(a b c);
print "done: @list\n";
