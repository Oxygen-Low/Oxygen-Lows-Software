#ifndef OXYGEN_FS_VFS_H
#define OXYGEN_FS_VFS_H

#include "types.h"

#define VFS_MAX_NAME_LEN 64
#define VFS_MAX_CHILDREN 64

#define VFS_TYPE_FILE      1
#define VFS_TYPE_DIRECTORY 2

struct VFSNode;

struct VFSDirectoryEntry {
    char name[VFS_MAX_NAME_LEN];
    uint32_t type;
    size_t size;
    VFSNode* node;
};

struct VFSNode {
    char name[VFS_MAX_NAME_LEN];
    uint32_t type;               // VFS_TYPE_FILE or VFS_TYPE_DIRECTORY
    size_t size;                 // Size in bytes
    uint8_t* data;               // Data buffer for files
    size_t capacity;             // Allocated capacity for data
    
    // Directory hierarchy
    VFSNode* parent;
    VFSNode* children[VFS_MAX_CHILDREN];
    size_t child_count;
};

#ifdef __cplusplus
extern "C" {
#endif

void     vfs_init(void);
VFSNode* vfs_get_root(void);
VFSNode* vfs_resolve_path(const char* path);
VFSNode* vfs_create_file(const char* path, const char* initial_content = nullptr);
VFSNode* vfs_create_directory(const char* path);
size_t   vfs_read(VFSNode* node, size_t offset, size_t size, uint8_t* buffer);
size_t   vfs_write(VFSNode* node, size_t offset, size_t size, const uint8_t* buffer);
bool     vfs_readdir(VFSNode* node, size_t index, VFSDirectoryEntry* entry_out);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_FS_VFS_H
