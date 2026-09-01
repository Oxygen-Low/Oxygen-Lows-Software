#include "fs/vfs.h"
#include "mm/heap.h"
#include "drivers/serial.h"

namespace {

VFSNode* g_vfs_root = nullptr;

size_t str_len(const char* s) {
    if (!s) return 0;
    size_t len = 0;
    while (s[len]) len++;
    return len;
}

void str_copy(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

bool str_equal(const char* s1, const char* s2) {
    if (!s1 || !s2) return false;
    while (*s1 && *s2) {
        if (*s1 != *s2) return false;
        s1++;
        s2++;
    }
    return *s1 == *s2;
}

VFSNode* create_node(const char* name, uint32_t type, VFSNode* parent) {
    VFSNode* node = (VFSNode*)kzalloc(sizeof(VFSNode));
    if (!node) return nullptr;

    str_copy(node->name, name, VFS_MAX_NAME_LEN);
    node->type = type;
    node->size = 0;
    node->data = nullptr;
    node->capacity = 0;
    node->parent = parent;
    node->child_count = 0;

    if (parent && parent->type == VFS_TYPE_DIRECTORY) {
        if (parent->child_count < VFS_MAX_CHILDREN) {
            parent->children[parent->child_count++] = node;
        }
    }

    return node;
}

} // anonymous namespace

extern "C" {

void vfs_init(void) {
    // Create Root directory
    g_vfs_root = create_node("/", VFS_TYPE_DIRECTORY, nullptr);

    // Create standard directory tree
    vfs_create_directory("/system");
    vfs_create_directory("/apps");
    vfs_create_directory("/docs");
    vfs_create_directory("/logs");

    // Create system information and documentation files
    vfs_create_file("/system/version.txt",
        "Oxygen Low's Software OS v1.4.0 (x86_64 Long Mode)\n"
        "Freestanding C++ Monolithic Kernel\n"
        "Brand: Oxygen Low's Software\n");

    vfs_create_file("/system/cpuinfo.txt",
        "Architecture: x86_64 (AMD64 / Intel 64)\n"
        "Mode: 64-Bit Long Mode with 4-Level Paging\n"
        "Features: FPU, SSE, SSE2, PIT 1000Hz, 16550 UART COM1\n");

    vfs_create_file("/docs/readme.txt",
        "Welcome to Oxygen Low's Software Operating System!\n\n"
        "Features:\n"
        "- Multiboot2 Compliant Bootloader\n"
        "- 4-Level Paging Virtual Memory Manager\n"
        "- Bitmap Physical Frame Allocator\n"
        "- Boundary-Tag Kernel Heap Allocator\n"
        "- 32-bit Linear Framebuffer Desktop Environment\n"
        "- Interactive Applications: Terminal, SysInfo, Notepad, Calculator, Explorer\n");

    vfs_create_file("/docs/license.txt",
        "Oxygen Low's Software Operating System\n"
        "Copyright (c) 2026 Oxygen Low's Software Project.\n"
        "All rights reserved.\n");

    vfs_create_file("/logs/boot.log",
        "[BOOT] Oxygen Low's Software kernel loaded\n"
        "[BOOT] RamFS virtual filesystem initialized successfully\n");

    serial_printf("[FS] RamFS in-memory filesystem initialized\n");
}

VFSNode* vfs_get_root(void) {
    return g_vfs_root;
}

VFSNode* vfs_resolve_path(const char* path) {
    if (!path || !g_vfs_root) return nullptr;
    if (str_equal(path, "/") || str_equal(path, "")) return g_vfs_root;

    VFSNode* curr = g_vfs_root;
    const char* p = path;

    if (*p == '/') p++;

    char token[VFS_MAX_NAME_LEN];

    while (*p) {
        size_t t_idx = 0;
        while (*p && *p != '/' && t_idx < VFS_MAX_NAME_LEN - 1) {
            token[t_idx++] = *p++;
        }
        token[t_idx] = '\0';
        if (*p == '/') p++;

        if (t_idx == 0) continue;

        // Search in children of curr directory
        bool found = false;
        if (curr->type == VFS_TYPE_DIRECTORY) {
            for (size_t i = 0; i < curr->child_count; ++i) {
                if (str_equal(curr->children[i]->name, token)) {
                    curr = curr->children[i];
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            return nullptr; // Path not found
        }
    }

    return curr;
}

VFSNode* vfs_create_directory(const char* path) {
    if (!path || !g_vfs_root) return nullptr;

    // Check if already exists
    VFSNode* existing = vfs_resolve_path(path);
    if (existing) return existing;

    // Split path into parent directory and new dirname
    char parent_path[VFS_MAX_NAME_LEN * 4];
    char dir_name[VFS_MAX_NAME_LEN];

    str_copy(parent_path, path, sizeof(parent_path));

    // Find last '/'
    int last_slash = -1;
    for (int i = 0; parent_path[i] != '\0'; ++i) {
        if (parent_path[i] == '/') last_slash = i;
    }

    if (last_slash <= 0) {
        str_copy(parent_path, "/", sizeof(parent_path));
        str_copy(dir_name, (last_slash == 0) ? path + 1 : path, sizeof(dir_name));
    } else {
        parent_path[last_slash] = '\0';
        str_copy(dir_name, path + last_slash + 1, sizeof(dir_name));
    }

    VFSNode* parent = vfs_resolve_path(parent_path);
    if (!parent || parent->type != VFS_TYPE_DIRECTORY) return nullptr;

    return create_node(dir_name, VFS_TYPE_DIRECTORY, parent);
}

VFSNode* vfs_create_file(const char* path, const char* initial_content) {
    if (!path || !g_vfs_root) return nullptr;

    // Check if file already exists
    VFSNode* existing = vfs_resolve_path(path);
    if (existing) {
        if (initial_content) {
            vfs_write(existing, 0, str_len(initial_content), (const uint8_t*)initial_content);
        }
        return existing;
    }

    char parent_path[VFS_MAX_NAME_LEN * 4];
    char file_name[VFS_MAX_NAME_LEN];

    str_copy(parent_path, path, sizeof(parent_path));

    int last_slash = -1;
    for (int i = 0; parent_path[i] != '\0'; ++i) {
        if (parent_path[i] == '/') last_slash = i;
    }

    if (last_slash <= 0) {
        str_copy(parent_path, "/", sizeof(parent_path));
        str_copy(file_name, (last_slash == 0) ? path + 1 : path, sizeof(file_name));
    } else {
        parent_path[last_slash] = '\0';
        str_copy(file_name, path + last_slash + 1, sizeof(file_name));
    }

    VFSNode* parent = vfs_resolve_path(parent_path);
    if (!parent || parent->type != VFS_TYPE_DIRECTORY) return nullptr;

    VFSNode* file = create_node(file_name, VFS_TYPE_FILE, parent);
    if (file && initial_content) {
        vfs_write(file, 0, str_len(initial_content), (const uint8_t*)initial_content);
    }

    return file;
}

size_t vfs_read(VFSNode* node, size_t offset, size_t size, uint8_t* buffer) {
    if (!node || node->type != VFS_TYPE_FILE || !buffer) return 0;
    if (offset >= node->size) return 0;

    size_t to_read = size;
    if (offset + to_read > node->size) {
        to_read = node->size - offset;
    }

    for (size_t i = 0; i < to_read; ++i) {
        buffer[i] = node->data[offset + i];
    }
    return to_read;
}

size_t vfs_write(VFSNode* node, size_t offset, size_t size, const uint8_t* buffer) {
    if (!node || node->type != VFS_TYPE_FILE || !buffer) return 0;

    size_t required_capacity = offset + size + 1;
    if (required_capacity > node->capacity) {
        size_t new_cap = ALIGN_UP(required_capacity * 2, 256);
        uint8_t* new_data = (uint8_t*)krealloc(node->data, new_cap);
        if (!new_data) return 0;
        node->data = new_data;
        node->capacity = new_cap;
    }

    for (size_t i = 0; i < size; ++i) {
        node->data[offset + i] = buffer[i];
    }

    if (offset + size > node->size) {
        node->size = offset + size;
        node->data[node->size] = '\0'; // Null-terminate string payload
    }

    return size;
}

bool vfs_readdir(VFSNode* node, size_t index, VFSDirectoryEntry* entry_out) {
    if (!node || node->type != VFS_TYPE_DIRECTORY || !entry_out) return false;
    if (index >= node->child_count) return false;

    VFSNode* child = node->children[index];
    str_copy(entry_out->name, child->name, VFS_MAX_NAME_LEN);
    entry_out->type = child->type;
    entry_out->size = child->size;
    entry_out->node = child;
    return true;
}

} // extern "C"
