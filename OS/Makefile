# ==============================================================================
# Oxygen Low's Software — Kernel & ISO Makefile
# Target: x86_64 Bare-Metal (Freestanding C++17)
# ==============================================================================

AS = nasm
CC = gcc
CXX = g++
LD = ld

ASFLAGS = -f elf64
CXXFLAGS = -ffreestanding -fno-builtin -fno-exceptions -fno-rtti -nostdlib \
           -mno-red-zone -mcmodel=kernel -O2 -Wall -Wextra -std=c++17 \
           -I include -I src/gui

LDFLAGS = -n -T linker.ld -nostdlib -z max-page-size=0x1000

# Recursive source file discovery
SRC_ASM := $(wildcard src/boot/*.asm) \
           $(wildcard src/arch/x86_64/*.asm)

SRC_CXX := $(wildcard src/*.cpp) \
           $(wildcard src/arch/x86_64/*.cpp) \
           $(wildcard src/drivers/*.cpp) \
           $(wildcard src/mm/*.cpp) \
           $(wildcard src/fs/*.cpp) \
           $(wildcard src/runtime/*.cpp) \
           $(wildcard src/gui/*.cpp) \
           $(wildcard src/apps/*.cpp)

OBJ_ASM := $(SRC_ASM:.asm=.o)
OBJ_CXX := $(SRC_CXX:.cpp=.o)
OBJS := $(OBJ_ASM) $(OBJ_CXX)

ISO_DIR := isodir
ISO_NAME := OxygenLowsSoftware.iso
KERNEL_ELF := kernel.elf
STAGED_KERNEL := $(ISO_DIR)/boot/kernel.elf
STAGED_GRUB := $(ISO_DIR)/boot/grub/grub.cfg

all: iso

kernel: $(KERNEL_ELF)

iso: $(ISO_NAME)

%.o: %.asm
	$(AS) $(ASFLAGS) $< -o $@

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(KERNEL_ELF): $(OBJS) linker.ld
	$(LD) $(LDFLAGS) -o $@ $(OBJS)

$(ISO_NAME): $(KERNEL_ELF) grub.cfg
	mkdir -p $(ISO_DIR)/boot/grub
	cp $(KERNEL_ELF) $(STAGED_KERNEL)
	cp grub.cfg $(STAGED_GRUB)
	grub-mkrescue -o $(ISO_NAME) $(ISO_DIR)

test: $(ISO_NAME)
	python3 test_runner.py --iso $(ISO_NAME) --timeout 25

run: $(ISO_NAME)
	qemu-system-x86_64 -cdrom $(ISO_NAME) -m 256M -serial stdio -vga std

run-headless: $(ISO_NAME)
	qemu-system-x86_64 -cdrom $(ISO_NAME) -m 128M -serial stdio -display none -no-reboot

clean:
	rm -rf $(OBJS) $(KERNEL_ELF) $(ISO_NAME) $(ISO_DIR)/boot/kernel.elf

.PHONY: all kernel iso test run run-headless clean
