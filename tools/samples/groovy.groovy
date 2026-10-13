package demo

import groovy.json.JsonSlurper

// a closure based class
class Greeter {
    String name = 'world'
    int times = 3

    def greet() {
        (1..times).each { i ->
            println "Hello, ${name} #$i"
        }
    }
}

def list = [1, 2, 3].collect { it * 2 }
def map = [a: 1, b: 'two', c: 3.5]
assert list == [2, 4, 6]
new Greeter(name: 'Groovy').greet()
def text = '''multi
line'''
