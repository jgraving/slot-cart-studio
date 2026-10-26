//! Browser label storage backed by the pinned device decoder, cleanup and resizer.
//! Only disk access is replaced with a per-render in-memory stash.

use std::cell::RefCell;
use std::path::Path;

const KEY: &str = "stash:label";

enum Stashed {
    Png(Vec<u8>),
    Rgba { px: Vec<u8>, w: u32, h: u32 },
}

thread_local! {
    static STASH: RefCell<Option<Stashed>> = const { RefCell::new(None) };
}

pub(crate) fn with_png<R>(png: &[u8], f: impl FnOnce(&Path) -> R) -> R {
    with(Stashed::Png(png.to_vec()), f)
}

pub(crate) fn with_rgba<R>(px: &[u8], w: u32, h: u32, f: impl FnOnce(&Path) -> R) -> R {
    with(
        Stashed::Rgba {
            px: px.to_vec(),
            w,
            h,
        },
        f,
    )
}

/// The stash lives for one call. A label left behind would hold megabytes for nothing, and could
/// be drawn onto the wrong cart.
fn with<R>(label: Stashed, f: impl FnOnce(&Path) -> R) -> R {
    STASH.with(|s| *s.borrow_mut() = Some(label));
    let out = f(Path::new(KEY));
    STASH.with(|s| *s.borrow_mut() = None);
    out
}

/// Slot's signature. `path` is the stash key `face` handed to `cart_face`.
pub(crate) fn cover_label(path: &Path, w: u32, h: u32) -> Option<Vec<u8>> {
    if path != Path::new(KEY) { return None; }
    let (mut src, sw, sh) = STASH.with(|s| match s.borrow().as_ref()? {
        Stashed::Png(bytes) => decode(bytes),
        Stashed::Rgba { px, w, h } => Some((px.clone(), *w, *h)),
    })?;
    crate::label_mask::clear_corner_background(&mut src, sw, sh);
    cover_rgba(&src, sw, sh, w, h)
}

// Share the device's decoder, alpha-aware resizer and SVG renderer.
pub(crate) use crate::device_art::{cover_rgba, decode_png_bytes, render_svg};

/// Straight RGBA, with slot's decoder settings. `label` and `hue` decode through here too, so a
/// logo the studio accepts is one slot would.
pub(crate) fn decode(png: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    let mut dec = png::Decoder::new(std::io::Cursor::new(png));
    dec.set_transformations(png::Transformations::normalize_to_color8());
    dec.set_limits(png::Limits { bytes: 64 << 20 });

    let reader = dec.read_info().ok()?;
    // Unlike slot's art.rs, a frame over 64 MiB is refused before it is allocated. The limit above
    // doesn't cover this buffer, which is sized from the header alone, so a 45-byte PNG can ask
    // for gigabytes; on wasm32 that traps and leaves the page unusable.
    if reader.output_buffer_size() > 64 << 20 {
        return None;
    }
    crate::device_art::decode_png_bytes(png)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        png.extend_from_slice(&(data.len() as u32).to_be_bytes());
        png.extend_from_slice(kind);
        png.extend_from_slice(data);
        let mut crc = crc32fast::Hasher::new();
        crc.update(kind);
        crc.update(data);
        png.extend_from_slice(&crc.finalize().to_be_bytes());
    }

    #[test]
    fn a_header_that_asks_for_a_huge_frame_is_refused() {
        // 20000x20000 RGBA is a 1.6 GB frame, asked for in 45 bytes with no image data in them.
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&20_000u32.to_be_bytes());
        ihdr.extend_from_slice(&20_000u32.to_be_bytes());
        ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        chunk(&mut png, b"IHDR", &ihdr);
        // Without an IDAT, read_info runs out of bytes first and the bound is never reached.
        chunk(&mut png, b"IDAT", &[]);

        let header = png::Decoder::new(std::io::Cursor::new(&png)).read_info();
        assert!(
            header.is_ok_and(|r| r.output_buffer_size() > 64 << 20),
            "the header alone passes read_info, so only the bound can refuse it"
        );
        assert!(decode(&png).is_none());
    }
}
