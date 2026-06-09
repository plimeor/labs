#ifndef ANCHOR_CORE_FFI_H
#define ANCHOR_CORE_FFI_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AnchorByteBuffer {
    uint8_t *ptr;
    uintptr_t len;
    uintptr_t cap;
} AnchorByteBuffer;

typedef struct AnchorSession AnchorSession;

void anchor_buffer_free(AnchorByteBuffer buffer);

AnchorByteBuffer anchor_core_fixture_summary_json(void);
AnchorSession *anchor_session_open_fixture(void);
void anchor_session_free(AnchorSession *session);
AnchorByteBuffer anchor_session_summary_json(const AnchorSession *session);
AnchorByteBuffer anchor_session_dispatch_insert_text_json(
    AnchorSession *session,
    const uint8_t *target_ptr,
    uintptr_t target_len,
    uint32_t at,
    const uint8_t *text_ptr,
    uintptr_t text_len
);
AnchorByteBuffer anchor_session_dispatch_direct_delete_json(
    AnchorSession *session,
    const uint8_t *target_ptr,
    uintptr_t target_len
);
AnchorByteBuffer anchor_session_dispatch_split_block_json(
    AnchorSession *session,
    const uint8_t *target_ptr,
    uintptr_t target_len,
    uint32_t at
);
AnchorByteBuffer anchor_session_dispatch_merge_backward_json(
    AnchorSession *session,
    const uint8_t *target_ptr,
    uintptr_t target_len
);
AnchorByteBuffer anchor_session_read_segment(AnchorSession *session);
AnchorByteBuffer anchor_fixture_blob(uintptr_t size);
AnchorByteBuffer anchor_blob_id_json(const uint8_t *bytes_ptr, uintptr_t bytes_len);

#ifdef __cplusplus
}
#endif

#endif
