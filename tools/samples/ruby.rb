# frozen_string_literal: true

require "json"
require_relative "helper"

# Comment
module Greeter
  VERSION = "1.0"

  class Person < Struct.new(:name, :age)
    include Comparable
    attr_reader :name

    def initialize(name, age = 0, *rest, key: nil, **opts, &block)
      @name = name
      @@count ||= 0
    end

    def <=>(other) = age <=> other.age

    def greet(greeting = "Hello")
      puts "#{greeting}, #{name}! #{age > 18 ? "adult" : 'minor'}"
      text = <<~EOS
        heredoc #{name}
          indented
      EOS
      symbols = %i[a b c] + %w[x y z]
      re = /(?<year>\d{4})-\d{2}/ix
      [1, 2, 3].each_with_index.map { |x, i| x * i }.select(&:even?)
      case age
      when 0..17 then :minor
      when Integer then :adult
      else :unknown
      end
    rescue StandardError => e
      warn e.message
    ensure
      nil
    end
  end
end

hash = { "a" => 1, b: 2, :c => [1.5, 0x1F, 1_000] }
puts hash.to_json unless hash.empty?
