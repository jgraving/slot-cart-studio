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
        Stashed::Png(bytes) => decode_png(bytes),
        Stashed::Rgba { px, w, h } => Some((px.clone(), *w, *h)),
    })?;
    crate::label_mask::clear_corner_background(&mut src, sw, sh);
    cover_rgba(&src, sw, sh, w, h)
}

// Share the device's decoder, alpha-aware resizer and SVG renderer.
pub(crate) use crate::device_art::{cover_rgba, render_svg};

/// Downloaded artwork may be WebP. Label composition always exports PNG for the device.
pub(crate) fn decode(bytes: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    if bytes.starts_with(b"RIFF") {
        decode_webp(bytes)
    } else {
        decode_png(bytes)
    }
}

fn decode_webp(bytes: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    let mut dec = image_webp::WebPDecoder::new(std::io::Cursor::new(bytes)).ok()?;
    let (w, h) = dec.dimensions();
    let rgba_size = (w as usize).checked_mul(h as usize)?.checked_mul(4)?;
    let size = dec.output_buffer_size()?;
    if rgba_size > 64 << 20 || size > 64 << 20 {
        return None;
    }
    let mut buf = vec![0u8; size];
    dec.read_image(&mut buf).ok()?;
    if dec.has_alpha() {
        return Some((buf, w, h));
    }
    let mut rgba = vec![255u8; rgba_size];
    for (to, from) in rgba.chunks_exact_mut(4).zip(buf.chunks_exact(3)) {
        to[..3].copy_from_slice(from);
    }
    Some((rgba, w, h))
}

/// On-card previews retain the pinned device's PNG decoder and allocation bound.
fn decode_png(png: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
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

    #[test]
    fn a_lossy_webp_keeps_its_size_and_its_alpha() {
        let (rgba, w, h) = decode(include_bytes!("../tests/fixtures/lossy.webp"))
            .expect("the kind of webp the art set serves");
        assert_eq!((w, h), (32, 16));
        assert_eq!(rgba.len(), 32 * 16 * 4);
        assert_eq!(rgba[(8 * 32 + 4) * 4 + 3], 255);
        assert_eq!(rgba[(8 * 32 + 28) * 4 + 3], 0);
    }

    #[test]
    fn an_opaque_webp_comes_back_with_alpha_filled_in() {
        let mut webp = Vec::new();
        image_webp::WebPEncoder::new(&mut webp)
            .encode(&[10, 20, 30].repeat(6), 3, 2, image_webp::ColorType::Rgb8)
            .expect("encodes");
        let (rgba, w, h) = decode(&webp).expect("decodes");
        assert_eq!((w, h), (3, 2));
        assert_eq!(rgba, [10, 20, 30, 255].repeat(6));
    }

    #[test]
    fn a_webp_header_that_asks_for_a_huge_frame_is_refused() {
        let mut webp = b"RIFF\0\0\0\0WEBPVP8L".to_vec();
        webp.extend_from_slice(&5u32.to_le_bytes());
        webp.push(0x2f);
        webp.extend_from_slice(&(0x3fffu32 | 0x3fff << 14).to_le_bytes());
        webp.resize(32, 0);
        let len = webp.len() as u32 - 8;
        webp[4..8].copy_from_slice(&len.to_le_bytes());
        assert!(decode(&webp).is_none());
    }

    #[test]
    fn a_riff_that_is_not_a_webp_is_refused() {
        assert!(decode(b"RIFF\x04\0\0\0WAVE").is_none());
    }

    #[test]
    fn the_cover_takes_only_what_slot_can_read_from_a_card() {
        assert!(decode_png(include_bytes!("../tests/fixtures/lossy.webp")).is_none());
    }

    #[test]
    fn a_downloaded_webp_exports_as_a_device_readable_png() {
        let bytes = include_bytes!("../tests/fixtures/lossy.webp");
        let label = crate::label::Label::full(bytes, slot_store::Platform::Gba).expect("webp label");
        let png = label.png();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        let (rgba, w, h) = decode_png(&png).expect("device PNG");
        assert_eq!(rgba.len(), (w * h * 4) as usize);
        assert!(rgba.chunks_exact(4).any(|p| p[3] == 0));
    }

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
