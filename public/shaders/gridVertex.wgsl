struct CameraUniforms {
    inverseProjection: mat4x4<f32>,
    inverseView: mat4x4<f32>,
    projection: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec3<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VSIn {
    @location(0) position: vec3<f32>,
    @location(1) color: vec3<f32>,
};

struct VSOut {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) color: vec3<f32>,
};

@vertex
fn vertexMain(input: VSIn) -> VSOut {
    var out: VSOut;
    out.clipPosition = camera.projection * camera.view * vec4<f32>(input.position, 1.0);
    out.color = input.color;
    return out;
}
