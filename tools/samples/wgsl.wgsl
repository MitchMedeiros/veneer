// a fragment shader
struct Uniforms {
    light: vec3<f32>,
    time: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

const PI: f32 = 3.14159;

fn shade(base: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
    let d = max(dot(normalize(n), normalize(u.light)), 0.0);
    return base * (0.2 + 0.8 * d);
}

@fragment
fn main(@location(0) uv: vec2<f32>, @location(1) n: vec3<f32>) -> @location(0) vec4<f32> {
    let c = textureSample(tex, samp, uv);
    if (c.a < 0.5) { discard; }
    return vec4<f32>(shade(c.rgb, n), 1.0);
}
