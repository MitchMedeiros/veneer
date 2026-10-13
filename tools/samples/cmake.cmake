cmake_minimum_required(VERSION 3.20)
project(demo VERSION 1.0 LANGUAGES CXX)

# options
option(BUILD_TESTS "Build tests" ON)
set(CMAKE_CXX_STANDARD 20)
set(SOURCES src/main.cpp src/util.cpp)

add_executable(demo ${SOURCES})
target_include_directories(demo PRIVATE include)
target_link_libraries(demo PRIVATE fmt::fmt)

if(BUILD_TESTS AND NOT WIN32)
  enable_testing()
  add_test(NAME demo_test COMMAND demo "--check")
endif()

foreach(src IN LISTS SOURCES)
  message(STATUS "source: ${src}")
endforeach()
#[[ block
comment ]]
