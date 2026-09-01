#ifndef OXYGEN_TYPES_H
#define OXYGEN_TYPES_H

// Fixed-width integer types
typedef signed char        int8_t;
typedef short              int16_t;
typedef int                int32_t;
typedef long long          int64_t;

typedef unsigned char      uint8_t;
typedef unsigned short     uint16_t;
typedef unsigned int       uint32_t;
typedef unsigned long long uint64_t;

typedef int64_t            intptr_t;
typedef uint64_t           uintptr_t;

typedef uint64_t           size_t;
typedef int64_t            ssize_t;
typedef int64_t            ptrdiff_t;

#ifndef __cplusplus
typedef _Bool bool;
#define true 1
#define false 0
#endif

#ifndef NULL
#define NULL ((void*)0)
#endif

// Common utility macros
#define BIT(n) (1ULL << (n))
#define ALIGN_UP(val, align) (((val) + (align) - 1) & ~((align) - 1))
#define ALIGN_DOWN(val, align) ((val) & ~((align) - 1))
#define MIN(a, b) (((a) < (b)) ? (a) : (b))
#define MAX(a, b) (((a) > (b)) ? (a) : (b))
#define CLAMP(x, low, high) (((x) < (low)) ? (low) : (((x) > (high)) ? (high) : (x)))
#define ARRAY_SIZE(arr) (sizeof(arr) / sizeof((arr)[0]))
#define UNUSED(x) ((void)(x))

#endif // OXYGEN_TYPES_H
