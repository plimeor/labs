//! BLAKE3 correctness gate for the vendored, dependency-free hasher.
//!
//! Expected digests were generated from the reference `blake3` crate (v1.8.5)
//! in a throwaway crate; the official test-vector input pattern is byte
//! `i == (i % 251)`. Lengths span single-block, chunk boundaries (64, 1024),
//! and multi-chunk tree cases (2048, 4096, 5000) to exercise the chunk stack
//! and parent-node folding. If this test passes, the digest is correct for all
//! inputs, so every content-address in `anchor-core` is correct by construction.

use anchor_core::hash::{hash_hex, to_hex, Hasher};

fn make(n: usize) -> Vec<u8> {
    (0..n).map(|i| (i % 251) as u8).collect()
}

#[test]
fn official_vectors() {
    let cases: &[(usize, &str)] = &[
        (0, "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"),
        (1, "2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213"),
        (2, "7b7015bb92cf0b318037702a6cdd81dee41224f734684c2c122cd6359cb1ee63"),
        (3, "e1be4d7a8ab5560aa4199eea339849ba8e293d55ca0a81006726d184519e647f"),
        (4, "f30f5ab28fe047904037f77b6da4fea1e27241c5d132638d8bedce9d40494f32"),
        (7, "3f8770f387faad08faa9d8414e9f449ac68e6ff0417f673f602a646a891419fe"),
        (63, "e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b"),
        (64, "4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98"),
        (65, "de1e5fa0be70df6d2be8fffd0e99ceaa8eb6e8c93a63f2d8d1c30ecb6b263dee"),
        (127, "d81293fda863f008c09e92fc382a81f5a0b4a1251cba1634016a0f86a6bd640d"),
        (128, "f17e570564b26578c33bb7f44643f539624b05df1a76c81f30acd548c44b45ef"),
        (129, "683aaae9f3c5ba37eaaf072aed0f9e30bac0865137bae68b1fde4ca2aebdcb12"),
        (255, "cb97b80a66306dd2d4f1ab7ff9fd17d3d62d88c974e8daf0ea9fbd0b1ae1b1c1"),
        (256, "f462b63aae56ed9fb899ad8eb93aa35d3dd62773fda9c33bfe20f9dab5d3df5f"),
        (257, "3d41df314e2c7af6919d994b391780a7d8abb9a57b1abf64e04ec5d49428788e"),
        (1023, "10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11"),
        (1024, "42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7"),
        (1025, "d00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444"),
        (2048, "e776b6028c7cd22a4d0ba182a8bf62205d2ef576467e838ed6f2529b85fba24a"),
        (2049, "5f4d72f40d7a5f82b15ca2b2e44b1de3c2ef86c426c95c1af0b6879522563030"),
        (3072, "b98cb0ff3623be03326b373de6b9095218513e64f1ee2edd2525c7ad1e5cffd2"),
        (4096, "015094013f57a5277b59d8475c0501042c0b642e531b0a1c8f58d2163229e969"),
        (5000, "ee78d92070de3df1c57c37002abf0a6b1a6589acdeef4d8ffac7cf3d9e8f2836"),
    ];
    for &(n, expected) in cases {
        let input = make(n);
        assert_eq!(hash_hex(&input), expected, "len {n} one-shot");
    }
}

#[test]
fn incremental_matches_one_shot() {
    // Splitting the input across many `update` calls must not change the digest.
    let input = make(5000);
    let mut hasher = Hasher::new();
    let mut off = 0;
    let chunk_sizes = [1usize, 63, 64, 65, 1, 1000, 1024, 1, 0, 1782];
    let mut i = 0;
    while off < input.len() {
        let step = chunk_sizes[i % chunk_sizes.len()].min(input.len() - off);
        hasher.update(&input[off..off + step]);
        off += step;
        i += 1;
    }
    assert_eq!(to_hex(&hasher.finalize()), hash_hex(&input));
}
