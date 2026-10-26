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
    let card = out.join("card");
    std::fs::create_dir_all(card.join("Games/GBA")).unwrap();
    std::fs::create_dir_all(card.join("Labels/GBA")).unwrap();
    let mut rom = vec![0u8;512];
    rom[0xac..0xb0].copy_from_slice(b"BPEE");
    std::fs::write(card.join("Games/GBA/Renderer Probe.gba"), &rom).unwrap();
    std::fs::write(out.join("probe.json"),format!(r#"{{"crc":"{:08X}"}}"#,crc32fast::hash(&rom))).unwrap();
    let mut logo = vec![0u8;128*64*4];
    for y in 12..52 { for x in 20..108 { if y<22 || y>42 || x<30 {
        logo[(y*128+x)*4..(y*128+x+1)*4].copy_from_slice(&[245,235,215,255]);
    }}}
    png(&out.join("logo.png"),128,64,&logo);
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
        if platform=="GBA" { std::fs::write(card.join("Labels/GBA/Renderer Probe.png"), &bytes).unwrap(); }
        let face=slot_cart_studio::face::from_png(&bytes,slot_cart_studio::face::platform_of(platform),"BPEE",&[],shell,"Renderer Probe");
        let size=slot_cart_studio::cart_size(platform);
        png(&out.join(format!("{platform}-cart.png")),size[0],size[1],&face);
    }
}
