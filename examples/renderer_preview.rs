//! Synthetic scanner labels rendered with the exact pinned device cartridge assets.
use std::path::Path;
fn png(path: &Path, w: u32, h: u32, pixels: &[u8]) {
    let mut enc = png::Encoder::new(std::fs::File::create(path).unwrap(), w, h);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header().unwrap().write_image_data(pixels).unwrap();
}
fn main() {
    let out = std::path::PathBuf::from(std::env::args().nth(1).expect("OUT"));
    std::fs::create_dir_all(&out).unwrap();
    for (platform, background, shell) in [("GBA", 0, "auto 239c47 clear"), ("GB", 255, "notched 9a978f solid"), ("GBC", 255, "rounded 2854b5 glitter")] {
        let (w,h) = if platform=="GBA" {(256,128)} else {(224,196)};
        let mut label = Vec::new();
        for y in 0..h { for x in 0..w {
            let (dx,dy)=(x.min(w-1-x) as f64+0.5,y.min(h-1-y) as f64+0.5);
            let outside=dx<24. && dy<24. && (24.-dx).powi(2)+(24.-dy).powi(2)>576.;
            label.extend_from_slice(&if outside {[background,background,background,255]} else if y>h/3 && y<h*2/3 && x>w/4 && x<w*3/4 {[20,25,35,255]} else {[215,135,55,255]});
        }}
        let source = out.join(format!("{platform}-scan.png"));
        png(&source,w,h,&label);
        let bytes=std::fs::read(&source).unwrap();
        let face=slot_cart_studio::face::from_png(&bytes,slot_cart_studio::face::platform_of(platform),"BPEE",&[],shell,"Renderer Probe");
        let size=slot_cart_studio::cart_size(platform);
        png(&out.join(format!("{platform}-cart.png")),size[0],size[1],&face);
    }
}
