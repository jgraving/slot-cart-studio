//! A cart face for a label held in memory, drawn by slot's own `cart_face`.

use std::path::Path;

use slot_store::Platform;

use crate::{art, cart};

/// The platform a card folder names. It picks the GBA cart or a Game Boy pak; which pak, and
/// its plastic, is the header's to say. Anything unrecognised is GBA, which is the folder the page falls back to
/// as well.
pub fn platform_of(dir: &str) -> Platform {
    match dir {
        "GB" => Platform::Gb,
        "GBC" => Platform::Gbc,
        _ => Platform::Gba,
    }
}

/// Slot's `cart_face` reads a cart's label through `art::cover` and its pak's header through
/// `gb`. Both answer from a stash here, so the cart names the stash keys where file paths
/// would go. The title is left empty because slot's generated label is titled from the stem, not
/// the header. `shell` is the choice empty for Automatic.
fn draw(
    platform: Platform,
    code: &str,
    head: &[u8],
    shell: &str,
    stem: &str,
    key: &Path,
) -> Vec<u8> {
    slot_store::gb::with_header(head, |rom| {
        let cart = slot_store::Cart {
            platform,
            stem: stem.to_string(),
            rom: rom.to_path_buf(),
            label: Some(key.to_path_buf()),
            title: String::new(),
            code: code.to_string(),
            shell: slot_store::ShellChoice::parse(shell),
        };
        let front = cart::cart_face(&cart).rgba;
        if cart::shows_interior(&cart) {
            let interior = cart::cart_interior(&cart).rgba;
            let board = cart::cart_backing(cart::gb_shell_of(&cart)).rgba;
            composite_layers(&[&interior, &board, &front])
        } else { front }

    })
}

/// PNG bytes as a card holds them. Bytes that don't decode fall back to slot's generated label,
/// as they do on the device.
pub fn from_png(
    png: &[u8],
    platform: Platform,
    code: &str,
    head: &[u8],
    shell: &str,
    stem: &str,
) -> Vec<u8> {
    art::with_png(png, |key| draw(platform, code, head, shell, stem, key))
}

/// Straight RGBA, `w` by `h`: a label composed in memory, shown without a PNG round trip.
#[allow(clippy::too_many_arguments)]
pub fn from_rgba(
    rgba: &[u8],
    w: u32,
    h: u32,
    platform: Platform,
    code: &str,
    head: &[u8],
    shell: &str,
    stem: &str,
) -> Vec<u8> {
    art::with_rgba(rgba, w, h, |key| {
        draw(platform, code, head, shell, stem, key)
    })
}

/// Composite the device's back plastic, board and front shell in shelf order.
/// Inputs and output use straight RGBA; transparent edge colours cannot bleed in.
pub fn composite_layers(layers: &[&[u8]]) -> Vec<u8> {
    let Some(first) = layers.first() else { return Vec::new(); };
    let mut out = vec![0u8; first.len()];
    for layer in layers {
        assert_eq!(layer.len(), out.len());
        for (dst, src) in out.chunks_exact_mut(4).zip(layer.chunks_exact(4)) {
            let (a, b) = (u64::from(src[3]), u64::from(dst[3]));
            let opacity = a * 255 + b * (255 - a);
            if opacity == 0 { continue; }
            for c in 0..3 {
                dst[c] = ((u64::from(src[c]) * a * 255 + u64::from(dst[c]) * b * (255 - a) + opacity / 2) / opacity) as u8;
            }
            dst[3] = ((opacity + 127) / 255) as u8;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transparent_shell_layers_composite_without_hidden_rgb_bleed() {
        assert_eq!(composite_layers(&[&[0, 0, 255, 255], &[255, 0, 0, 128]]), [128, 0, 127, 255]);
        assert_eq!(composite_layers(&[&[255, 255, 255, 0], &[10, 20, 30, 128]]), [10, 20, 30, 128]);
    }
}
