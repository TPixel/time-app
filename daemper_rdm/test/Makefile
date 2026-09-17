# Kør: make            (bygger og kører unit-tests af RDM-kernen)
#      make syntax     (syntax-tjekker Arduino-filerne med stub-headers, kræver g++)
#      make clean
CC      ?= gcc
CXX     ?= g++
CFLAGS  ?= -std=c99 -Wall -Wextra -Wpedantic -Wshadow -Wconversion -O1 -g
CXXFLAGS?= -std=c++11 -Wall -Wextra -fsyntax-only -Istubs -I..

all: test_rdm
	./test_rdm

test_rdm: test_rdm.c ../rdm_responder.c ../rdm_responder.h ../e120.h
	$(CC) $(CFLAGS) -o $@ test_rdm.c ../rdm_responder.c

syntax:
	$(CXX) $(CXXFLAGS) -x c++ ../timo_spi.cpp
	$(CXX) $(CXXFLAGS) -x c++ ../daemper_rdm.ino
	@echo "syntax OK"

clean:
	rm -f test_rdm

.PHONY: all syntax clean
