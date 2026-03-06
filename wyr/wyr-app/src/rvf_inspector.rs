use serde::Serialize;
use std::fs;
use std::path::Path;

/// RVF segment header (64 bytes)
const RVF_MAGIC: u32 = 0x52564653; // "RVFS"
const SEGMENT_HEADER_SIZE: usize = 64;

#[derive(Debug, Serialize, Clone)]
pub struct RvfFileInfo {
    pub path: String,
    pub file_size: u64,
    pub is_valid_rvf: bool,
    pub segments: Vec<SegmentInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SegmentInfo {
    pub segment_type: u8,
    pub type_name: String,
    pub offset: u64,
    pub size: u64,
    pub flags: u32,
}

fn segment_type_name(t: u8) -> &'static str {
    match t {
        0x01 => "VEC_SEG",
        0x02 => "INDEX_SEG",
        0x03 => "OVERLAY_SEG",
        0x04 => "GRAPH_SEG",
        0x05 => "MANIFEST_SEG",
        0x06 => "QUANT_SEG",
        0x07 => "META_SEG",
        0x08 => "JOURNAL_SEG",
        0x09 => "COW_MAP_SEG",
        0x0A => "WITNESS_SEG",
        0x0B => "PROFILE_SEG",
        0x0C => "CRYPTO_SEG",
        0x0D => "TRANSFER_PRIOR",
        0x0E => "KERNEL_SEG",
        0x0F => "EBPF_SEG",
        0x10 => "WASM_SEG",
        0x11 => "CLUSTER_MAP_SEG",
        0x12 => "CLUSTER_DELTA_SEG",
        _ => "UNKNOWN",
    }
}

/// Inspect an RVF file and return segment information.
pub fn inspect_rvf(path: &str) -> RvfFileInfo {
    let p = Path::new(path);
    if !p.exists() {
        return RvfFileInfo {
            path: path.to_string(),
            file_size: 0,
            is_valid_rvf: false,
            segments: vec![],
            error: Some("File not found".to_string()),
        };
    }

    let data = match fs::read(p) {
        Ok(d) => d,
        Err(e) => {
            return RvfFileInfo {
                path: path.to_string(),
                file_size: 0,
                is_valid_rvf: false,
                segments: vec![],
                error: Some(format!("Read error: {e}")),
            };
        }
    };

    let file_size = data.len() as u64;

    // Check magic
    if data.len() < 4 {
        return RvfFileInfo {
            path: path.to_string(),
            file_size,
            is_valid_rvf: false,
            segments: vec![],
            error: Some("File too small".to_string()),
        };
    }

    let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    if magic != RVF_MAGIC {
        return RvfFileInfo {
            path: path.to_string(),
            file_size,
            is_valid_rvf: false,
            segments: vec![],
            error: Some(format!("Invalid magic: 0x{magic:08X} (expected 0x{RVF_MAGIC:08X})")),
        };
    }

    // Parse segments
    let mut segments = Vec::new();
    let mut offset = 0usize;
    while offset + SEGMENT_HEADER_SIZE <= data.len() {
        let seg_magic = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        if seg_magic != RVF_MAGIC {
            break;
        }

        let seg_type = data[offset + 8];
        let flags = u32::from_le_bytes([
            data[offset + 12],
            data[offset + 13],
            data[offset + 14],
            data[offset + 15],
        ]);
        let content_size = u64::from_le_bytes([
            data[offset + 16],
            data[offset + 17],
            data[offset + 18],
            data[offset + 19],
            data[offset + 20],
            data[offset + 21],
            data[offset + 22],
            data[offset + 23],
        ]);

        segments.push(SegmentInfo {
            segment_type: seg_type,
            type_name: segment_type_name(seg_type).to_string(),
            offset: offset as u64,
            size: content_size,
            flags,
        });

        // Move to next segment (header + content, 64-byte aligned)
        let total = SEGMENT_HEADER_SIZE as u64 + content_size;
        let aligned = total.div_ceil(64) * 64;
        offset += aligned as usize;
    }

    RvfFileInfo {
        path: path.to_string(),
        file_size,
        is_valid_rvf: true,
        segments,
        error: None,
    }
}

/// Get HNSW index stats from the wyr-ruvector engine.
#[derive(Debug, Serialize)]
pub struct HnswStats {
    pub total_vectors: usize,
    pub dimensions: Option<usize>,
    pub m: usize,
    pub ef_construction: usize,
}

pub fn get_hnsw_stats(index: &wyr_ruvector::HnswIndex) -> HnswStats {
    let dim = if !index.is_empty() {
        index.get_vector(0).map(|v| v.dim())
    } else {
        None
    };
    HnswStats {
        total_vectors: index.len(),
        dimensions: dim,
        m: 16,
        ef_construction: 64,
    }
}
