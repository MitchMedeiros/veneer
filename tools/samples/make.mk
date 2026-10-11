# comment
CC := gcc
CFLAGS ?= -O2 -Wall
OBJS = main.o util.o
.PHONY: all clean

all: app

app: $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^

%.o: %.c
	@echo "compiling $<"
	$(CC) -c $< -o $@

ifeq ($(DEBUG),1)
CFLAGS += -g
endif

define HELP
usage: make
endef

clean:
	rm -f app $(OBJS)
